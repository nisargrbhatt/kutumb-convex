# HEIC on browsers that can't read it

Type: grilling Status: resolved Blocked by: 17

## Question

Photos must reach the Worker as JPEG, but raw HEIC can't be decoded by Chrome, Firefox, Edge or
Android browsers. Do we ship `heic-to/csp` lazily, given LGPL-3.0, HEVC patents and a reported
libde265 with high-severity advisories? Or reject HEIC there with a clear message, or use a paid
fallback? Also: is a poster plus download link acceptable for HEVC video on browsers with no
decoder?

No device facts are coming, and poster plus download link is now the default for any `<video>` error:
[Real device and plan checks](17-real-device-and-plan-checks.md). Rejecting HEIC where
`createImageBitmap` fails is the restrictive option.

## Answer

Reject. No `heic-to`, no paid conversion. Nothing else ships for HEIC.

- **Photos stay JPEG at the Worker.** `createImageBitmap` is the only test: no browser sniffing. Safari
  and iOS Safari 17+ decode HEIC natively, and the iPhone Photos picker hands over JPEG, so the iPhone
  camera roll works with no decoder.
- **What gets rejected:** a HEIC file on Chrome, Edge, Firefox, Samsung Internet, Chrome Android or
  older Safari. The member exports it as JPEG. This narrows the standing "no manual converting" rule
  to iPhone and Safari.
- **Why not `heic-to`:** LGPL-3.0, HEVC patents, and an open, unanswered issue says it embeds libde265
  1.0.16 with high-severity advisories. None of that can be checked here. It can be added later with
  no migration, since the Worker only ever sees JPEG.
- **Why not paid:** bytes would need converting on the server, against R2 + Workers only and "Worker
  never rewrites bytes".
- **`accept` stays `image/*,.heic,.heif`** on every browser, so the file can be picked and the
  rejection can explain itself.
- **Two messages,** inline on the gallery item or in the crop Drawer. Other gallery items carry on.
  Copy lives with the upload constants.
  - HEIC, known by type, extension or `ftyp` brand (`file.type` can be empty): "This browser can't
    open HEIC photos. Export it as JPEG, or upload from an iPhone or Safari."
  - Anything else: "This photo couldn't be read. Try a different file."

HEVC video: keep accepting it, with no warning to the uploader. iPhones record it by default. A viewer
whose browser can't play it gets poster plus download link, or the placeholder when the uploader's
browser couldn't make a poster either.
