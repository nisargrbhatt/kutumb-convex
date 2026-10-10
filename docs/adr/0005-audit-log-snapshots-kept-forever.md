# Audit log keeps snapshots forever, with no FKs, including deleted profiles' personal data

Audit Events (and Change Requests) reference profiles, users and relations by id **plus a
snapshot** (names, full profile/address/relation snapshots on create/delete), with no foreign keys
except to the organization. They are kept forever and die only with the org. So a hard-deleted
profile's personal data stays readable by owner/admin in the audit log.

- **Snapshots, not FKs.** History must stay readable after a profile is hard-deleted (rejected
  create, owner delete) or an Actor leaves the org. Rejected FKs with `ON DELETE SET NULL`: the
  event would lose who/what it was about.
- **Kept forever, no retention window.** Accountability for community data outweighs storage cost
  on D1 at our scale. Rejected TTL purge: no requirement, adds a scheduled job.
- **No erasure of deleted profiles' data.** Accepted trade-off: an erasure request would need a
  redaction pass over `auditEvent.payload` / name columns. Out of scope until a real request or
  legal need appears; then add a redact operation, don't drop the snapshot design.
