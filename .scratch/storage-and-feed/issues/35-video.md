# Video in the gallery

Status: resolved Blocked by: 34

## What to build

- Pure atom walker on `readRange`, used by browser and Worker: brand, codec, duration, size,
  rotation, location data.
- Browser: renames `meta` and `udta` to `free` in a new `Blob` from `File` slices, draws an optional
  poster, strips it. Gallery `accept` adds `.mov`, `.mp4`.
- Worker: verifies `video` and `poster`, stores `durationMs`, `width`, `height`, `contentType`.
- `GET`: hand-built `206`, single `Range`, multi-range gets `200`, `If-Range` by ETag.
- Video tile, placeholder, lightbox playback, failure slide, download link.

## Spec

[spec.md](../spec.md): Upload > Limits, Upload > Video in the browser, Upload > Worker verification,
Serving > Range, Feed UI (Video).

## Done when

- [ ] Walker fixtures: H.264 `.mp4`, HEVC `.mov`, portrait rotation, `moov` at end, leftover
  location data, 121 s, over 95,000,000 bytes.
- [ ] Read count stays capped on a large file.
- [ ] `206` tests: `0-1` probe, open-ended, suffix, multi-range, stale `If-Range`.
- [ ] Nothing downloads before play: no `video` request on Feed or lightbox open. Local dev.
- [ ] Leaving the slide stops the download.
- [ ] Swipe is off once started; buttons still work.
- [ ] `error` and zero `videoWidth` both show the failure slide with a working download.
- [ ] A `.mov` plays in local Chrome served as `video/quicktime`.
- [ ] No poster: placeholder tile, play still offered.

## Comments

Merged 36cfbbc on feat/storage-integration.
