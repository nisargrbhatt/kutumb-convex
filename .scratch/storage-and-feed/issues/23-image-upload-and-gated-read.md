# Image upload and gated read

Status: resolved Blocked by: 22

## What to build

The blob layer for images, proven by tests: a Blob can be reserved, uploaded, verified, read
through the gate, and discarded. No UI, no memo.

- `blob` table and enums in `src/db/constants.ts`, all three `ownerKind`s and all three `mediaKind`s
  from the start. Migration via `npm run migration:generate`.
- Pure rules: required variants per `mediaKind`, blob URL builder, can-attach check.
- Limits in `src/domain/limits.ts`; `pendingUpload` limit kind, `LIMIT_COPY`, `Counters` member
  pending byte sum, unexpired rows only.
- Start and discard server functions.
- `PUT /api/blob/<orgId>/<blobId>/<variant>`: the four upload steps, with `put({ sha256 })` for
  `profilePhoto` `display`.
- Pure JPEG walker taking `readRange(offset, length)`, plus the browser strip that shares it.
- `GET` of the same path: every request does the full owning-record check. Response headers, `ETag`,
  `304` after R2 `head()`, `?download=1`.
- `Clear-Site-Data: "cache"` on sign-out, in `src/server.ts`.

## Spec

[spec.md](../spec.md): Constraints, Blobs (Record, Variants, Lifecycle), Upload (all but video),
Serving (Gate without memo, Response).

## Done when

- [ ] JPEG walker rejects APP1, APP13, COM and a missing SOS; accepts a stripped WebKit-shaped file.
  Fixture includes the 76-byte APP1 and 56-byte APP13.
- [ ] `PUT` rejects: wrong `Origin`, another user's row, row not `pending`, unknown variant, no
  `Content-Length`, over 5 MiB, over declared.
- [ ] A row discarded during `put()` loses its bytes.
- [ ] `PUT` with a wrong `sha256` fails in local Miniflare. If Miniflare doesn't check it, say so on
  the ticket.
- [ ] `GET` gives one identical `404` for non-member, wrong org, missing Blob and `pending`.
- [ ] `GET` hides a photo on an `inactive` profile from a plain member, shows it to owner/admin and
  the linked user, using `visibleProfileWhere`.
- [ ] A Change Request owned Blob is readable by submitter and owner/admin only.
- [ ] `304` turns to `404` once the object is gone.
- [ ] Pending cap throws `LimitError`; expired rows don't count; discard frees it at once.

## Comments

Merged 957f067 on feat/storage-integration.
