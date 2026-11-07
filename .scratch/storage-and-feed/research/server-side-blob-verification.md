# Server-side blob verification in Workers

Ticket: `.scratch/storage-and-feed/issues/03-server-side-blob-verification.md`. Checked 2026-11-07.
`[n]` = source list near the end. `[lab]` = my own run; limits of that run are in "Lab setup".

## Answer

A Worker can reliably check container type, header pixel size, video duration, codec, and location
metadata, all without decoding, by reading a few KB from R2. It can't prove a video's bitstream
decodes, and it can't decode full-size iPhone photos inside 128 MB.

So: the browser converts every photo to a downscaled JPEG. The Worker accepts only JPEG for images,
and strips metadata by walking markers. Videos stay as uploaded (`.mov` or `.mp4`, H.264 or HEVC).
The Worker parses them by range read and removes location by renaming atoms.

No paid add-on is required. One thing can't be done without transcoding: HEVC playback on browsers
with no HEVC decoder. That gap gets a poster and a download link.

## What a Worker can verify

| Property                    | Reliable?                            | How                                   | Cost                                                     |
| --------------------------- | ------------------------------------ | ------------------------------------- | -------------------------------------------------------- |
| Real type                   | Container only; a hint, not validity | `file-type` on first 4,100 B          | 1 range read                                             |
| Image pixel size            | Yes, as the header declares it       | `image-size`                          | JPEG/PNG 4 KB; HEIC see below                            |
| Image actually decodes      | Only by decoding                     | jSquash, small images only            | See "Limits"                                             |
| Video duration              | Yes, from sample tables              | Mediabunny                            | 12 reads, 9.5 KB on 319 MB                               |
| Video codec, size, rotation | Yes, as declared in `stsd`/`tkhd`    | Mediabunny                            | Same reads                                               |
| Video bitstream is valid    | No (no HEVC decoder in a Worker)     | Not checked; bad file just won't play | -                                                        |
| GPS present                 | Yes for known locations              | `exifr`; Mediabunny raw tags          | JPEG full read in lab; HEIC 64 KB on samples; MOV `moov` |

Findings from adversarial fixtures [lab]:

- HTML renamed `.jpg`: `file-type` returns nothing. Rejected.
- JPEG with `<script>` appended: passes `file-type` and `image-size`. Magic bytes prove nothing
  about trailing bytes; `file-type` itself calls detection "a best-effort hint" [8].
- `mvhd` forged to 1 s: Mediabunny still reports 10 s. It reads track data, not `mvhd`.
- Valid `ftyp` then junk, and `moov` declaring 3 GB: Mediabunny throws nothing. It returns zero
  tracks and duration 0. **No exception does not mean valid.** Assert at least one video track and
  duration above 0, and pre-walk top-level boxes (a walker caught both, in 5 reads or fewer).
- Mediabunny's codec string said `hev1...` for a file whose `stsd` entry is `hvc1`. Read the fourcc
  if you need it; don't use that string for it.
- HEIC: `image-size` failed on the first 4,100 B (`meta` box was 5.6 KB), passed on 64 KB. Reports
  the largest image, so 8064x6048 and not the tile size. Real files may need more; read by `meta`
  box size.

Parser hardening, not run in the lab: cap `moov` size, and make `CustomSource.read` [9] throw past a
read or byte budget. Some `compute*` calls can do many reads [9].

## Libraries in Workers

All ran in workerd with `nodejs_compat` [lab]. Whole lab bundle: 1,610 KiB, 369 KiB gzip, against a
64 MiB uncompressed limit [1].

| Library                    | Version      | Licence    | Use                        | Note                                         |
| -------------------------- | ------------ | ---------- | -------------------------- | -------------------------------------------- |
| `file-type`                | 22.3.0       | MIT        | Sniff                      | Robustness is best-effort [8]                |
| `image-size`               | 2.1.0        | MIT        | Header dimensions          | GitHub repo archived, moved to Codeberg [10] |
| `mediabunny`               | 1.65.2       | MPL-2.0    | MOV/MP4 parse, range reads | `CustomSource` gives random access [9]       |
| `exifr`                    | 7.1.3        | MIT        | GPS detect, JPEG and HEIC  | Last published 2022                          |
| `@jsquash/jpeg`, `/resize` | 1.6.0, 2.1.1 | Apache-2.0 | Decode/encode              | Workers needs manual WASM init [11]          |

Ruled out for Workers:

- Anything needing threads: Workers has no Web Worker API and one thread per Worker [12].
- WASM compiled from bytes at runtime: only pre-compiled modules are supported [12].
- `libheif-js` / `heic-to` server-side: fits the bundle, but see the memory numbers. LGPL-3.0.

## Limits

- Memory: 128 MB per **isolate, not per request**, WASM included. Concurrent requests share it [1].
- CPU: Free 10 ms. Paid 30 s default, 5 min max via `limits.cpu_ms`. Network wait is not counted
  [1].
- Request body: 100 MB on Free and Pro zones [1]. A 2-minute 4K30 HEVC clip is 350 MB or more
  (Apple's figure for Final Cut Camera) [16], so video can't pass through a Worker on those plans.
  Verification has to happen after upload.
- Subrequests: 10,000 Paid; 50 Free, 1,000 Free to internal services [1].
- Queue consumers: 15 min wall, same CPU limits [1][3].

Decode memory, Node as a proxy for the isolate [lab]:

| Image      | RGBA   | RSS growth on decode | Fits 128 MB?                         |
| ---------- | ------ | -------------------- | ------------------------------------ |
| 12 MP JPEG | 49 MB  | 108 MB               | No margin once resize or encode runs |
| 48 MP JPEG | 195 MB | 403 MB               | No                                   |

Full 12 MP pipeline in workerd: decode 60 ms, resize to 2048 wide 899 ms, encode 181 ms [lab].
Already well past the Free 10 ms. Server-side decode only makes sense for images capped at about 5
MP (20 MB RGBA).

## Reading part of a file from R2

- `get(key, { range: { offset, length } })`, or `suffix` for the tail. `head()` gives size [2].
- Each read is a `GetObject`, Class B, $0.36/million. The page doesn't say how range GETs are
  billed; assuming one op per call, a video check costs about $4 per million uploads [4].
- `moov` was at the tail in my Apple-encoded samples [lab]. Walking top-level boxes reads 16 B per
  box and skips `mdat` by its size. No need to read the media.
- Presigned PUT docs cover binding `Content-Type`, say nothing on size, and POST isn't supported
  [5]. So take real size from `head()` after upload, and ignore the claimed type.

## Stripping GPS

Honest users are the ones at risk here. A hostile client only leaks its own location, so the server
check exists to catch client bugs and bypassed conversion.

**JPEG.** Walk markers up to SOS, drop APP1 (Exif/XMP), APP3-15, COM; keep APP2 (ICC). No pixel
decode. Removed GPS, `exifr` confirmed none left, dimensions unchanged [lab]. Also cut anything
after EOI, which handles the appended-payload case (not run in the lab). **This also drops the
orientation tag**, so a JPEG that wasn't normalised in the browser would display rotated. Reject or
accept that; it only hits clients that skipped the canvas step.

**Canvas re-encode in the browser.** Chrome 157 output had no `Exif`, only APP0 and APP2 [lab].
Orientation was baked in: the sample tagged orientation 6 came out portrait [lab].

**MOV/MP4.** Location sits in `meta` under `moov`, `trak`, or `mdia`, or in user data [14], under
`com.apple.quicktime.location.ISO6709` [15]. Apple says readers may skip `free` atoms [17]. So
renaming `meta`/`udta` to `free` is 4 bytes, same length, no `stco` change, no remux:

- 319 MB file streamed R2 to R2 through `FixedLengthStream`, JS writing only the 4-byte patches. 1.7
  s wall in local workerd [lab]. Production CPU not measured.
- AVFoundation afterwards: still playable, frame decoded at 5 s, metadata list empty. Chrome played
  it too [lab].
- This also drops harmless tags such as make. Rotation is unaffected; it's in `tkhd`.
- The R2 API has no patch call [2], so it's a full copy. Skip it when no location is found.
- Must walk `trak` and `mdia` too. My lab code only walked `moov` children. After patching, assert
  `ISO6709` appears nowhere in `moov`. Also check the `©xyz` user-data atom (from memory,
  unsourced).

**Android** hides photo location from apps by default under scoped storage, but reading video
location needs no extra permission [18]. So Android videos can still carry it.

## Decompression bombs

A 875 KB PNG declared 30000x30000: 3.6 GB as RGBA. `image-size` read that from the first 4,100 B
[lab]. The rule is to check header dimensions before any decode, and reject above a pixel cap.

If the Worker never decodes, the Worker can't be bombed. The risk moves to viewers' browsers, so the
cap still applies. libheif ships its own security limits for the same reason [13]. Cloudflare Images
caps area at 100 MP [6].

Never accept SVG: `image-size` reads it, but it's a script container, not a photo.

## HEIC photos

**Display.** Only Safari 17+ and iOS Safari 17+. Chrome, Edge, Firefox, Samsung Internet: no [19].
MDN doesn't list it as a web format [20]. Chrome 157: `<img>` and `createImageBitmap` both fail
[lab]. So stored HEIC would be broken for most viewers. **Don't store it.**

**Convert in the browser.**

- Safari 17+: native decode, then canvas. No WASM (from [19]; not run, no Safari in lab).
- Others: `heic-to` (libheif WASM), 3.2 MB JS, lazy-loaded, LGPL-3.0. Chrome 157: 12 MP in about 0.5
  s, 48 MP in about 0.9 s [lab]. Synthetic flat images; real photos will likely be slower.
- Then downscale with canvas, which also removes metadata. iOS canvas area cap is 8192x8192 in
  current WebKit source [21], so a target like 2560 px is safe. Output JPEG: `toBlob` falls back to
  PNG silently for unsupported types [22].
- Detect by magic bytes, not `file.type`.

**What iPhones actually hand the page.** From WebKit source, not a device test:

- `PhotoPickerPrefersOriginalImageFormat` defaults to false [23], which selects
  `PHPickerConfigurationAssetRepresentationModeCompatible` [24]: "the most compatible representation
  if possible" [25].
- So iOS web photos probably arrive as JPEG by default. What "compatible" does to HEVC video isn't
  documented. Safari itself is closed source and could override the preference. If it does,
  `Current` mode keeps HEIC and WebKit re-exports video to `.MOV` with
  `AVAssetExportPresetHighestQuality` [24].
- HEIC still arrives through the Files picker, Android, and desktop. Handle both.

## HEVC `.mov` videos

**Playback support.**

| Browser          | HEVC                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| Safari           | macOS High Sierra+ all devices [26]; iOS 11+ [19b]                                                              |
| Chrome           | 107+. macOS 11+ and Android 5+ all devices; Windows 8+ and Linux hardware only [19b][26]                        |
| Edge             | Windows needs hardware and the Store HEVC extension [26]                                                        |
| Firefox          | Windows 134, macOS 136, Linux 137, Android 137 hardware only. Windows software path needs a paid extension [26] |
| Samsung Internet | 21+ [19b]                                                                                                       |

**Container.** MDN lists QuickTime as older Safari only [27]. My Chrome run disagrees: Chrome 157 on
macOS played HEVC and H.264 `.mov` served as `video/quicktime`, `video/mp4`, and
`application/octet-stream`, though `canPlayType('video/quicktime')` returned `""` [lab]. Don't gate
on that. Firefox's `MP4Decoder` allow-lists `video/quicktime` [28]; not run.

**What breaks with no transcoding.**

- Chrome on Windows or Linux without HEVC hardware, Edge without the Store extension, Windows
  Firefox without the paid one: no playback [26]. This is the one gap only transcoding closes.
- iPhone HDR: Dolby Vision 8.4 is `hvc1`, Main10, HLG with `dvvC` [29]. In Firefox's HEVC bug a
  Mozilla developer calls Dolby Vision unsupported, and a profile 8.1 sample fails; the reporter
  argues 8.1/8.4 should fall back [30]. No iPhone file was tested there, or by me.
- Posters: no decoder in a Worker, so no server-side frame. Grab one in the browser at upload with
  `<video>` + canvas. The uploading phone can decode its own video. On a desktop without HEVC
  support, no poster: use a placeholder.
- Tail `moov`: the player must fetch the end first, so serving must honour `Range` (ticket 02). iOS
  requires byte-range support [31].
- ProRes: 3.1 GB/min or more [16]. Reject by allowlist and by size.

**Feasible without transcoding.**

- Parse, validate, and scrub, as above.
- Optional client remux `.mov` to `.mp4` with Mediabunny: copies packets [32], `tags: {}` strips
  metadata. Ran in Node: `moov` first, `hvc1` kept, no `ISO6709`, Chrome played it [lab]. Doesn't
  add codec support, so low value. `fastStart: 'in-memory'` holds the whole file in RAM [33], bad
  for 350 MB on a phone. Skip for v1.
- Client-side transcode via WebCodecs exists as a future escape hatch, but it is transcoding, so out
  of scope.

## Paid add-ons

**Not needed for anything in scope.** What they would buy:

- **Images binding:** HEIC input [6][7], `.info()` unbilled, 20 MB input cap [6]. Output drops
  metadata by default, GPS included [34]. 5,000 unique transforms a month free, then needs the paid
  plan at $0.50 per 1,000 [35]. Useful if browser conversion ever proves unreliable.
- **Media Transformations:** `mode=frame` could make posters. Input under 100 MB, H.264/AAC MP4;
  other formats "may work but are untested" [36]. So not for 350 MB HEVC. `mode=video` output caps
  at 60 s [36].
- **Stream:** the only real fix for universal playback, by transcoding. Out of scope.

## Lab setup and limits

Throwaway code, not committed. Wrangler 4.158 local dev, Chrome 157 headless on macOS, Node 26.

- **Samples are synthetic**: made with Apple's encoders on a Mac (AVAssetWriter, ImageIO), not
  captured on an iPhone. Real files may carry extra tracks or atoms. The 319 MB file is padded.
- Local workerd enforces neither 128 MB nor CPU limits. R2 was the local simulator. Timings are from
  an Apple-silicon Mac, not Cloudflare.
- Not run: Safari, Firefox, Windows, Android, any real phone. `simctl` wasn't available.

## Open questions

- What does iOS Safari really deliver: JPEG or HEIC, H.264 or HEVC? Needs a real iPhone.
- Does location hide anywhere else in real iPhone `.mov` files, such as timed metadata tracks?
- Is Kutumb on Workers Paid? Free's 10 ms CPU likely can't run this.
- Keep PNG/GIF/WebP, or JPEG only? Recommendation loses transparency and animation.
- HEVC patent exposure from shipping a decoder in `heic-to`? Legal call, not researched.
- Queue consumer likely needs a custom server entry under TanStack Start. Worth it for scrub?

## Sources

1. Workers limits: https://developers.cloudflare.com/workers/platform/limits/
2. R2 Workers API: https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
3. Queues limits: https://developers.cloudflare.com/queues/platform/limits/
4. R2 pricing: https://developers.cloudflare.com/r2/pricing/
5. R2 presigned URLs: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
6. Images limits and formats: https://developers.cloudflare.com/images/get-started/limits/ and
   binding: https://developers.cloudflare.com/images/optimization/binding/
7. HEIC changelog: https://developers.cloudflare.com/changelog/post/heic-support/
8. file-type readme: https://github.com/sindresorhus/file-type
9. Mediabunny reading: https://mediabunny.dev/guide/reading-media-files
10. image-size readme: https://github.com/image-size/image-size
11. jSquash readme: https://github.com/jamsinclair/jSquash
12. Workers WebAssembly: https://developers.cloudflare.com/workers/runtime-apis/webassembly/
13. libheif readme: https://github.com/strukturag/libheif
14. QTFF metadata atoms:
    https://developer.apple.com/documentation/quicktime-file-format/metadata_atoms_and_types
15. QTFF location metadata:
    https://developer.apple.com/documentation/quicktime-file-format/location_metadata
16. Apple video sizes:
    https://support.apple.com/guide/final-cut-camera/set-the-video-format-dev14d309a3f/ios
17. QTFF 2001, free and skip atoms: https://developer.apple.com/standards/qtff-2001.pdf
18. Android media location: https://developer.android.com/training/data-storage/shared/media
19. caniuse HEIF: https://caniuse.com/heif. 19b. HEVC: https://caniuse.com/hevc (read from
    `caniuse-db` 1.0.30001823)
20. MDN image types: https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types
21. WebKit `CanvasBase.cpp`:
    https://github.com/WebKit/WebKit/blob/main/Source/WebCore/html/CanvasBase.cpp
22. MDN `toBlob`: https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob
23. WebKit preferences:
    https://github.com/WebKit/WebKit/blob/main/Source/WTF/Scripts/Preferences/UnifiedWebPreferences.yaml
24. WebKit `WKFileUploadPanel.mm`:
    https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/ios/forms/WKFileUploadPanel.mm
25. Apple asset representation modes:
    https://developer.apple.com/documentation/photosui/phpickerconfiguration-swift.struct/assetrepresentationmode
26. MDN video codecs: https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Video_codecs
27. MDN containers: https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Containers
28. Firefox `MP4Decoder.cpp`:
    https://github.com/mozilla-firefox/firefox/blob/main/dom/media/mp4/MP4Decoder.cpp
29. Apple TN3145: https://developer.apple.com/documentation/technotes/tn3145-hdr-video-metadata
30. Firefox bug 1945371: https://bugzilla.mozilla.org/show_bug.cgi?id=1945371
31. Apple Safari video guide (archived):
    https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/CreatingVideoforSafarioniPhone/CreatingVideoforSafarioniPhone.html
32. Mediabunny conversion: https://mediabunny.dev/guide/converting-media-files
33. Mediabunny output formats: https://mediabunny.dev/guide/output-formats
34. Images features: https://developers.cloudflare.com/images/optimization/features/
35. Images pricing: https://developers.cloudflare.com/images/pricing/
36. Media Transformations: https://developers.cloudflare.com/stream/transform-videos/
37. MDN nosniff: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Content-Type-Options

## Recommendation

Verify after upload, in the Worker, with no decoding and no paid add-ons.

1. **Upload to a pending key.** Nothing is served until a finalize step marks it verified.
2. **Photos, in the browser:** any input, HEIC included (native on Safari 17+, lazy `heic-to`
   elsewhere), goes through canvas to JPEG, downscaled (about 2560 px for gallery; ticket 12
   decides). Crop for Profile Photos uses the same path.
3. **Photos, in the Worker:** accept JPEG only. `head()` for size, sniff, read SOF dimensions,
   reject over the pixel cap, then walk markers: drop metadata, cut after EOI, write to the final
   key.
4. **Videos, in the Worker:** accept `.mov`/`.mp4` with `avc1`, `hvc1`, or `hev1`. Pre-walk boxes,
   cap `moov`, parse with Mediabunny under a read budget, require a video track, duration under 2
   minutes, and size under the cap. If location is present, rename atoms in a streamed copy. Run
   that from a Queue consumer rather than the request. Reject the rest with a clear message.
5. **Poster:** the browser captures one at upload, and it goes through the photo path. Placeholder
   if the browser can't decode.
6. **Serving:** set `Content-Type` from the verified kind, never the client's. Add
   `X-Content-Type-Options: nosniff` [37], honour `Range`. On `<video>` error, show poster plus download.
7. **Accept the gap:** HEVC won't play on some Windows and Linux setups. Revisit only with evidence
   of real users hitting it. Stream or client-side transcoding are the options then.

Before the spec is final, test one real iPhone: Safari picker output, HDR clip, location in `.mov`.
