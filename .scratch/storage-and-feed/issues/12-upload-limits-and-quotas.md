# Upload limits and storage quotas

Type: grilling Status: resolved Blocked by: 01, 03

## Question

What are the actual numbers and where do they apply? File size per type, accepted types, pixel
dimensions, the "certain filesize" for sub-2-minute videos, per-org storage cap, and any per-member
cap. How do they fit ADR 0003 constants in `src/domain/limits.ts`, and what does a member see on
hitting one?

Do pending Profile Photo bytes (held by an open `photo` Change Request) count against org storage?

Pending Blobs count toward storage until discarded or expired, up to 24h. Multipart part lists come
from the client, so the size cap can't rely on them: see [Blob model](11-blob-model.md).

## Answer

Per file, constants in `src/domain/limits.ts`:

- Video: at most 120 s and 100,000,000 bytes. `.mov`/`.mp4`, `avc1`, `hvc1` or `hev1`, longest edge
  at most 4096 px. No in-app trim. 100 MB is the real limit (estimates: 1080p30 about 1:40, 4K30
  about 35 s, 4K60 about 15 s), so rejection copy leads with size.
- Image variants, longest edge: Profile Photo `avatar` 128 px, `display` at most 1024 px
  ([Profile Photo crop editor](14-profile-photo-crop-editor.md) picks the size); Memory image `thumb`
  640 px, `display` 2048 px; video `poster` 1280 px.
- `poster` is optional: a browser that can't decode the clip can't make one, so it gets a
  placeholder. Refines "all required variants landed" in [Blob model](11-blob-model.md).
- 5 MiB cap per image variant in the Worker.
- Browser only: picked photo at most 50 MiB; JPEG, PNG, WebP, HEIC (subject to
  [HEIC on browsers that can't read it](16-heic-on-browsers-that-cant-read-it.md)). No GIF, no SVG.

Storage ([ADR 0011](../../../docs/adr/0011-no-storage-cap-per-file-limits-only.md)):

- No org cap, no per-member cap on attached bytes, no rate limit binding. So pending `photo` Change
  Request bytes count against nothing.
- `pending` bytes capped at 500 MB per member (one full gallery). Pending bytes are the only ones no
  admin can see or remove, so anything beyond that has to be posted where it's visible.

Upload:

- Every file is one `put()`. **Overrides multipart** in [Upload path to R2](01-r2-upload-path.md) and
  [Blob model](11-blob-model.md): no part route, `uploadId`, client part list or
  `--abort-multipart-days`. A dropped connection restarts the file.
- Start declares the size, checks caps and the pending cap, and reserves it on the `pending` row. The
  Worker checks `Content-Length` before writing, `head()` after. Over declared: delete and fail.
  Otherwise real size replaces the reservation.

Hitting a limit:

- Per-file checks run in the browser before upload, inline on that gallery item. The Worker re-checks
  with the same constants.
- Pending cap throws `LimitError` kind `pendingUpload`, with `LIMIT_COPY` and the usual PostHog
  capture. `Counters` gains a member pending byte sum.
- ADR 0003's race now overshoots the pending cap by up to one file. Harmless.
- `getOrgUsage` and the settings overview show storage used as a plain number, no limit bar.

## Comments

Video cap now 95,000,000 bytes, and pending cap counts only unexpired rows. See
[Real device and plan checks](17-real-device-and-plan-checks.md).

HEIC stays accepted, but is rejected where the browser can't decode it. See
[HEIC on browsers that can't read it](16-heic-on-browsers-that-cant-read-it.md).

Upload gains a row re-read after `put()`: bytes are deleted if the Blob is no longer `pending`. See
[Cancelled Memory edit](20-cancelled-memory-edit.md).
