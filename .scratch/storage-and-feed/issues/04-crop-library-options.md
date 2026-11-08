# Crop library options

Type: research Status: resolved Blocked by:

## Question

Which crop library fits a Profile Photo editor in this stack (React, Tailwind v4, shadcn, SSR)?
Compare maintained options on touch support, bundle size, SSR safety, accessibility, and output to
canvas/Blob so only the cropped result is uploaded. Cover browser handling of EXIF orientation and
HEIC input.

## Answer

`react-easy-crop` (6.2.4, 8.0 KB gz): best touch, SSR-safe, CSS-styled. We add a ~25-line canvas to
Blob export, aria props and a zoom Slider. Runner-up: `react-avatar-editor`. Normalize once with
`createImageBitmap`, capped at 2048 px (bakes EXIF upright, stays under iOS canvas limit). Export
JPEG, not WebP (Safari).

No crop library handles HEIC. iOS Photos picker gives JPEG, but raw HEIC arrives via iOS Files and
on Chrome, Firefox, Edge, Android. Lazy-loading `heic-to/csp` on decode failure works but needs an
owner decision: LGPL-3.0, HEVC patents, and an open issue says it embeds a libde265 with
high-severity advisories (unconfirmed). Nothing ran on a real device; SSR verdicts are static reads.

Findings: `.scratch/storage-and-feed/research/crop-library-options.md` on branch
`research/crop-library-options`.

## Comments

`heic-to` not adopted, and the `decode` fallback above is dropped: HEIC is rejected where
`createImageBitmap` fails. See [HEIC on browsers that can't read it](16-heic-on-browsers-that-cant-read-it.md).
