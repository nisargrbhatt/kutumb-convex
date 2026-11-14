# Server-side blob verification in Workers

Type: research Status: resolved Blocked by:

## Question

What can a Worker reliably verify about an uploaded file without trusting the client: real type by
magic bytes, image pixel size, video duration, codec?

Cover: JS/WASM libraries that run in Workers, CPU and memory limits, reading only part of a file
from R2, re-encoding or stripping EXIF (GPS), image decompression bombs. Cover iPhone HEIC photos
and HEVC `.mov` videos: what browsers can display or play, what can be converted in the browser
before upload, and what breaks with no transcoding. Video transcoding is out of scope, so say what
is feasible without it.

## Answer

A Worker can check type, header pixel size, video duration, codec and GPS without decoding: 12 range
reads, 9.5 KB on a 319 MB `.mov`. It can't prove the video bitstream decodes, or decode full-size
iPhone photos (12 MP adds 108 MB RSS against the 128 MB isolate limit, measured in Node).

Browser converts all photos, HEIC included, to downscaled JPEG. Worker accepts JPEG only and strips
metadata by marker walk. Videos stay as uploaded, with GPS removed by renaming `meta`/`udta` atoms
to `free` in a streamed copy, no remux; the result played in AVFoundation and Chrome. No paid add-on
needed. Only transcoding fixes HEVC on browsers with no decoder: those get a poster plus download
link.

Lab samples were synthetic, made on a Mac. Local workerd enforces no memory or CPU limits. Only
Chrome 157 on macOS was run. A sibling agent's `npm install` may have touched this lab's
`node_modules`, so rerun any number the spec leans on.

Findings: `.scratch/storage-and-feed/research/server-side-blob-verification.md` on branch
`research/server-side-blob-verification`.

## Comments

Worker strip and streamed copy overridden: browser strips, Worker verifies and rejects. See
[Real device and plan checks](17-real-device-and-plan-checks.md).
