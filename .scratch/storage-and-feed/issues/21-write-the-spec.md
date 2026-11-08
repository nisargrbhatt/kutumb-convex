# Write the spec

Type: task Status: resolved Blocked by:

## Question

Write `.scratch/storage-and-feed/spec.md` from the resolved tickets and ADRs 0009 to 0012, and give
the slicing order for implementation tickets. Later comments on a ticket override its answer, so
read those too. Carry unconfirmed defaults from
[Feed card, gallery and detail page](15-feed-card-gallery-detail.md) and the `main` `min-w-0` fix.
The `/memories` to `/feed` move goes straight in, per the map's Notes.

## Answer

Done: [spec.md](../spec.md), all tickets and ADRs 0009 to 0012 merged, later comments applied. Slicing
order is its last section: 15 slices, tickets numbered from `22`, tracks A (storage, Profile Photo)
and B (Feed) independent until C1 (gallery).

Found while writing:

- WebKit `canvas.toBlob` JPEGs carry APP1 Exif (76 bytes) and APP13 (56 bytes), probed on macOS 26. The
  Worker's "reject any APP1" would have rejected every Safari photo. Browser now strips every APPn
  but APP0 and COM. Probe of the strip: 136 bytes gone, decodes, sampled pixel identical. Not run on
  iOS.
- `sha256` conflicted with "CPU doesn't grow with file size": browser sends it, `put({ sha256 })`
  validates it.
- Glossary and ADR 0011 still said 100 MB: both now 95 MB.

Spec section "Gaps this spec filled" lists everything no ticket decided, for owner veto. Its
"Unconfirmed defaults" carries those from tickets 14 and 15.
