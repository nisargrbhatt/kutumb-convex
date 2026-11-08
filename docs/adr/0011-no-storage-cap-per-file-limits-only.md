# No storage cap, per-file limits only

Extends ADR 0003. Blob storage has no per-org or per-member cap on what is posted. The only limits
are on each upload (a video is at most 2 minutes and 95 MB) and on a member's `pending` bytes
(500 MB, one full gallery), all constants in `src/domain/limits.ts`. Pre-launch and single tier, a
storage quota is more product than the cost justifies: 100 GB is about $1.50 a month on R2.

- **Considered**: a 10 GiB org cap (bounds the bill, but a community's memories stop at an arbitrary
  line, and every upload path needs a full-org state); a per-member cap on attached bytes (owner/admin
  can already remove posted media); a rate limit binding on uploads (members are invited, and posted
  media is visible and removable).
- **Consequences**: the storage bill has no ceiling, and the only guard against a member posting
  without limit is owner/admin removal. Pending bytes stay capped because no admin can see or remove
  them. Adding a cap later strands any org already over it, so storage used is shown on the settings
  overview from day one.
