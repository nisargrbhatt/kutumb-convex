# Research: Crop library for the Profile Photo editor

Ticket: "Crop library options" (storage-and-feed). Researched 2026-11-07. Stack: TanStack Start SSR
on Workers, React `^19.2.7`, Tailwind v4, shadcn new-york.

## TL;DR

- **Use `react-easy-crop`** (6.2.4, 8.0 KB gz). Best touch, styles with CSS, SSR-safe. Export is ~25
  lines of our own code. It needs aria props and a zoom Slider from us.
- **Runner-up: `react-avatar-editor`** (16.0.0, 5.0 KB gz). Better a11y and built-in canvas output,
  but it repaints a canvas and its overlay colors are JS arrays.
- **No crop library handles HEIC.** The photo must be decoded before the cropper sees it.
- **iPhone camera roll is mostly solved by iOS:** the Photos picker hands the page a JPEG. Raw HEIC
  still arrives via the iOS Files picker and on Chrome/Firefox/Edge/Android, which can't decode it.
- **HEIC fallback: `heic-to/csp`**, lazy-loaded only on decode failure (790 KB gz). Carries LGPL and
  codec-CVE caveats, see below.
- **EXIF:** normalize once with `createImageBitmap(file)`, which applies orientation by default.
  Don't rely on `drawImage(<img>)`: no spec text defines it.
- Nothing here was run on a real device. Source reading and docs only. See "Device test matrix".

## Crop libraries

Size is my measurement: esbuild 0.25 minified ESM, gzip, React external, JS only, default entry.
Downloads are npm last-week. "SSR" is a static read of the dist files; nothing was executed.

| Library | Latest (date) | DL/wk | gz | Touch | SSR | A11y | Output |
|---|---|---|---|---|---|---|---|
| **react-easy-crop** | 6.2.4 (2026-10-06) | 5.44M | 8.0 KB | Drag, pinch zoom, two-finger rotate, Safari gesture events | No browser globals at module scope | Crop area `tabIndex=0`, arrows pan. No role/label by default; add via `cropperProps`, `mediaProps` | Pixel rect only. Canvas/Blob is ours |
| react-avatar-editor | 16.0.0 (2026-10-01) | 1.08M | 5.0 KB | Drag, pinch zoom. No rotate gesture | Guarded. Canvas `width` uses `devicePixelRatio`, so hydration can differ | `role=application`, arrows pan, `+`/`-` zoom. Label hard-coded in English | `getImage()`, `getImageScaledToCanvas()` return canvas |
| react-image-crop | 11.1.2 (2026-06-21) | 4.34M | 3.9 KB | Pointer drag on handles. No pinch or image zoom documented | No browser globals at module scope | Best: labelled focusable handles | `cropToCanvas`, `cropToImg` |
| cropperjs | 2.3.1 (2026-10-16) | 2.80M | 14.5 KB | `touch-action:none`; pinch not verified | **Unsafe to import on server:** `class CropperElement extends HTMLElement` unguarded | `keyboard` attr, document-level keydown. No aria found | `$toCanvas()` |
| react-advanced-cropper | 0.20.1 (2025-03-01) | 246k | 25.2 KB | Not inspected | Not inspected | Not inspected | Not inspected |
| @origin-space/image-cropper | 0.1.9 (2025-05-02) | 19k | 3.8 KB | Pinch, drag (README) | No browser globals at module scope | ARIA + required description (README) | No canvas export documented |

Sources: [npm registry], [easy-crop src], [avatar src], [image-crop README], [cropper src],
[origin README].

Ruled out:

- `react-cropper`: last release 2023-04-12, pins `cropperjs ^1.5`.
- `react-mobile-cropper`: peers stop at React 18.
- `croppie`: last release 2020-06-16.
- `react-advanced-cropper`: largest, 20 months since release, core `advanced-cropper` last shipped
  2024-06-09.
- `@origin-space/image-cropper`: repo untouched since 2025-05-02, 62 stars.
- `react-image-crop`: box-drawing model. Users drag handles over a fixed image rather than
  pan/zoom it behind a circle, which suits avatars poorly on phones.
- `cropperjs`: largest of the viable ones. Shadow DOM keeps Tailwind out, no React wrapper.

### easy-crop vs avatar-editor

| | react-easy-crop | react-avatar-editor |
|---|---|---|
| Rendering | DOM `<img>` + CSS transform | `<canvas>`, full repaint on change. README says disabling HiDPI "can improve performance on mobile" |
| Theming | Classes, CSS file | Overlay is an RGBA array prop, so tokens must be read in JS |
| Responsive | Fills parent | `width="100%"` works, but percent `height` needs a fixed-height parent |
| Output size | We pick it, any device | `getImageScaledToCanvas()` is editor-sized, so device-dependent with `100%`. `getImage()` is original res |
| Input | URL string | URL or `File` |
| Export code | ~25 lines. Long-open request [#347] | ~3 lines |
| Cadence | Major 6 in 2026-06, 14 releases in 12 months | Majors 14, 15, 16 inside 12 months |

Smoothness on low-end Android is inferred from the architecture, not benchmarked.

Known easy-crop gaps: open [#520] (blurry zoomed preview on Safari). The docs sample
[getCroppedImg] builds a full-size intermediate canvas and sets no quality. Don't copy it as is; see
the canvas limit below.

## HEIC

Native decode: **Safari 17+ and iOS Safari 17+ only**. Chrome, Edge, Firefox, Samsung Internet and
Chrome Android are unsupported; 15.26% global usage. [caniuse HEIF]

What the page receives on `<input type=file>`:

| Source | Page gets | Evidence |
|---|---|---|
| iOS Photos picker | **JPEG, whatever `accept` says** | `_preferredAssetRepresentationMode` returns `Compatible` unless `PhotoPickerPrefersOriginalImageFormat`, which defaults to `false` [WK panel] [WK prefs]. The opt-out was reverted in 2024 for Adobe Express [WK revert] |
| iOS camera | JPEG | "Fall back to a JPEG representation" when no image URL [WK panel] |
| iOS Files picker | **Raw HEIC** (my reading: no transcode in this path) | `documentPicker:didPickDocumentsAtURLs:` goes straight to `_chooseFiles` [WK panel] |
| macOS Safari | Raw HEIC with `image/*`; decodes natively | Transcoding only triggers on restrictive `accept` [WK 292350] |
| Chrome/Edge/Firefox, Android | Raw HEIC, undecodable | [caniuse HEIF] |

So `accept` can't be relied on alone, and a fallback decoder is required: an iCloud photo on a
Windows Chrome laptop, or iOS 16 via Files, both hit it.

`accept` value: **`image/*,.heic,.heif`**, no `capture`.

- Chrome reportedly needs HEIC listed explicitly to allow selection [Apple forum]. Community report,
  not spec.
- Safari 17+ converted JPEG/PNG to HEIC when `image/heic` sat beside `image/*`. Fixed in
  305283@main on 2026-01-08 [WK 303803]; current code honors `image/*` [WK ImageUtils]. Shipping
  Safari version unknown. Harmless here: Safari decodes it and we re-encode anyway.
- `accept` is only a hint; the server must validate [MDN accept].

Decoders:

| Package | Latest (date) | License | gz | Notes |
|---|---|---|---|---|
| **heic-to** | 1.6.7 (2026-10-27) | LGPL-3.0 | 790 KB (3.2 MB min) | Tracks libheif (1.23.7). `/csp` has no `eval`, `/next` runs in workers. No `WebAssembly` refs in dist; README builds `USE_WASM=0`, so plain JS |
| heic2any | 0.0.4 (2023-03-29) | MIT | 341 KB | Stale. Open decode failures incl. iPhone 15 Pro on iOS 18 [heic2any #50, #61] |
| libheif-js | 1.23.5 (2026-10-04) | LGPL-3.0 | n/a | Lower level; we'd write the wrapper |

heic-to caveats:

- **Security.** Issue [heic-to #37] says it embeds libde265 1.0.16, and its README build recipe pins
  that. libde265 is at v1.1.3 (2026-09-14) with high-severity heap advisories [libde265 advisories].
  I couldn't confirm the version from the bundle. My assessment: moderate risk. The input is the
  user's own file, decoded in the tab's JS heap, and only re-encoded canvas pixels get uploaded.
  Watch #37.
- **License.** LGPL-3.0 code in a client chunk, plus HEVC patents ("complex and expensive to
  license" [caniuse HEIF]). Needs an owner decision.
- **Size** is fine for delivery if lazy: Workers assets allow 25 MiB/file, Worker 64 MiB
  uncompressed [Workers limits]. TanStack code is isomorphic unless constrained [TS execution], so
  check it stays out of the initial client chunk.

Server-side conversion rejected: the original would leave the device, against the ticket.

## EXIF orientation

- CSS: `image-orientation` defaults to `from-image`. Chrome 81, Firefox 26, Safari 13.1 [MDN
  image-orientation] [BCD]. So easy-crop's DOM `<img>` displays upright.
- `createImageBitmap`: `imageOrientation` defaults to `from-image` [MDN createImageBitmap]. Option
  support: Chrome 52, Firefox 93, Safari 15 [BCD]. **Well defined.**
- `drawImage(<img>)`: **undefined by spec.** The WHATWG section has no orientation text [HTML
  canvas], CSSWG [#4666] is still open, and MDN warns only of "older browser versions" [MDN
  drawImage]. WebKit takes it from computed style, and its `width`/`height` fell back to ignoring
  orientation for unrendered images, at least at the 2020 fix [WK 209849].
- react-image-crop's README calling EXIF a "browser wide issue" looks dated.

Decoding to an `ImageBitmap` first removes the question, because pixels are baked upright.

## Canvas output

- `toBlob(cb, "image/jpeg", 0.9)`. Default is PNG, and unsupported types fall back to PNG silently
  [MDN toBlob]. **`image/webp` is unsupported in Safari** [BCD], so don't request it; check
  `blob.type`.
- iOS canvas limit: MDN gives **4096×4096**. Exceeding it makes the canvas "unusable", and drawing
  stops working [MDN canvas]. Hence capping the normalized image.
- JPEG has no alpha, so transparent PNGs turn black. Fill white first.
- Spec names only resolution and color profile as output metadata [HTML canvas], so EXIF/GPS should
  not survive (inference; confirm with a fixture).

## Recommendation

Add `react-easy-crop` and `heic-to`. Client pipeline:

```ts
async function decode(file: File) {
	try {
		return await createImageBitmap(file); // upright; fails on undecodable HEIC
	} catch {
		const { heicTo, isHeic } = await import("heic-to/csp");
		if (!(await isHeic(file))) throw new Error("unsupported image");
		return createImageBitmap(await heicTo({ blob: file, type: "image/jpeg", quality: 0.92 }));
	}
}
```

1. Pick: `<input accept="image/*,.heic,.heif">`. Feature-detect by decode failure, no UA sniffing.
2. Normalize: draw the bitmap to a canvas capped at **2048 px longest edge** on white, `toBlob`
   JPEG, then `URL.createObjectURL`. This fixes EXIF, the iOS limit and cropper memory in one step.
3. Crop: `<Cropper aspect={1} cropShape="round" disableAutomaticStylesInjection />`, importing
   `react-easy-crop/react-easy-crop.css`.
4. Export: own helper using `croppedAreaPixels`, one canvas at fixed output size (e.g. 512),
   `toBlob` JPEG 0.9. Upload only that Blob.
5. Server: re-check type, magic bytes and size. Never trust `accept`.

Stack fit:

- **SSR:** put the editor in the right-side Sheet via `FormDrawer`, lazy-loaded. Wrap in
  `<ClientOnly>` [TS execution] if it can render during SSR. No existing `ClientOnly` usage in
  `src`.
- **Use `Sheet`, not `src/components/ui/drawer.tsx`:** that one is vaul, a drag-driven drawer that
  may compete with crop drags (not tested).
- **A11y:** shadcn `Slider` for zoom is required, because pinch and wheel aren't keyboard-reachable.
  Pass `cropperProps={{ role, "aria-label" }}` and `mediaProps={{ alt }}`. Arrow pan works already.

Switch to `react-avatar-editor` if we'd rather drop export code and accept canvas rendering. The
rest of the pipeline is unchanged.

### Device test matrix

Not run. Before shipping, test with Orientation 6 JPEG, rotated HEIC, and a high-res (>4096 px)
photo:

- iOS Safari: Photos, camera, Files. Confirms the table above, and `createImageBitmap` on raw HEIC.
- Chrome Android, Windows Chrome, Firefox: HEIC fallback, rotated HEIC comes out upright.
- Low-end Android: decode memory and heic-to time (no worker in step 1; move to `/next` if janky).
- Chrome/Firefox for iOS: assumed to share WebKit's panel, unverified.
- Confirm output has no EXIF/GPS.

## Open questions

- LGPL + HEVC patents in client chunk: acceptable?
- Ship heic-to before #37 is fixed?
- Output size: 512 or 1024?
- Free rotation or 90° only?
- Drop HEIC fallback, show "use Safari/JPEG" error instead? Violates ticket; only if license blocks.

## Sources

Version, date and download data pulled 2026-11-07. WebKit line references are `main` on that date.

- [npm registry]: https://registry.npmjs.org/react-easy-crop (same path per package),
  https://api.npmjs.org/downloads/point/last-week/react-easy-crop
- [easy-crop src]: https://github.com/ValentinH/react-easy-crop (`index.module.mjs` in 6.2.4)
- [getCroppedImg]:
  https://github.com/ValentinH/react-easy-crop/blob/main/docs/src/components/cropImage.ts
- [#347]: https://github.com/ValentinH/react-easy-crop/issues/347
- [#520]: https://github.com/ValentinH/react-easy-crop/issues/520
- [avatar src]: https://github.com/mosch/react-avatar-editor (README; `dist/index.mjs` in 16.0.0)
- [image-crop README]: https://github.com/dominictobias/react-image-crop
- [cropper src]: https://github.com/fengyuanchen/cropperjs (`@cropper/element`,
  `@cropper/element-selection`, `@cropper/element-canvas` 2.3.1)
- [origin README]: https://github.com/origin-space/image-cropper
- heic-to: https://github.com/hoppergee/heic-to
- [heic-to #37]: https://github.com/hoppergee/heic-to/issues/37
- [heic2any #50, #61]: https://github.com/alexcorvi/heic2any/issues/50,
  https://github.com/alexcorvi/heic2any/issues/61
- libheif-js: https://github.com/catdad-experiments/libheif-js
- [libde265 advisories]: https://github.com/strukturag/libde265/security/advisories,
  https://github.com/strukturag/libde265/releases/tag/v1.1.3
- [caniuse HEIF]: https://caniuse.com/heif
- [BCD]: https://github.com/mdn/browser-compat-data (`api/HTMLCanvasElement.json`,
  `api/_globals/createImageBitmap.json`, `css/properties/image-orientation.json`)
- [MDN toBlob]: https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob
- [MDN createImageBitmap]: https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap
- [MDN drawImage]:
  https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage
- [MDN image-orientation]:
  https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/image-orientation
- [MDN canvas]: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/canvas
- [MDN accept]: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/accept
- [HTML canvas]: https://html.spec.whatwg.org/multipage/canvas.html
- [#4666]: https://github.com/w3c/csswg-drafts/issues/4666
- [WK panel]:
  https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/ios/forms/WKFileUploadPanel.mm
- [WK prefs]:
  https://github.com/WebKit/WebKit/blob/main/Source/WTF/Scripts/Preferences/UnifiedWebPreferences.yaml
- [WK revert]: https://github.com/WebKit/WebKit/commit/5b0e147c095567387a080a2da87c79f95ed04744
  (original change: https://github.com/WebKit/WebKit/commit/02a5c284178e4c4c9184cf721954243d59678a03)
- [WK ImageUtils]:
  https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/graphics/cg/ImageUtilitiesCG.cpp
- [WK 292350]: https://bugs.webkit.org/show_bug.cgi?id=292350
- [WK 303803]: https://bugs.webkit.org/show_bug.cgi?id=303803
- [WK 209849]: https://bugs.webkit.org/show_bug.cgi?id=209849
- [Apple forum]: https://developer.apple.com/forums/thread/743049
- [Workers limits]: https://developers.cloudflare.com/workers/platform/limits/
- [TS execution]: https://tanstack.com/start/latest/docs/framework/react/guide/execution-model
- Code: `package.json`, `src/components/ui/form-drawer.tsx`, `src/components/ui/drawer.tsx`,
  `src/components/ui/slider.tsx`.
