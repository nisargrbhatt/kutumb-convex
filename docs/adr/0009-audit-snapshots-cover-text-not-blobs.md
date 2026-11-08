# Audit snapshots cover text, not blobs

ADR 0005 keeps snapshots forever so history stays readable. That stops at image bytes: an Audit
Event about a Profile Photo keeps metadata only (blob id, sha256, size, dimensions, who, when), and
the bytes are deleted once the photo is replaced, removed, or its profile deleted. So owner/admin
can see _that_ a photo changed, not what it showed.

- **Considered**: keeping bytes forever (fully matches ADR 0005, but an abusive or illegal image
  could never be purged, and dead bytes count against storage); a grace period (needs a retention
  rule and a scheduled job, with no requirement behind it).
- **Consequences**: moderation removal really removes. The sha256 still proves which file it was if
  someone holds a copy.
