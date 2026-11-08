# Who can change a Profile Photo

Type: grilling Status: resolved Blocked by:

## Question

Who may set, replace or remove a Profile Photo, and how does that fit existing rules? Today every
non-admin change to a Userless Profile is a Change Request, and a linked profile never has one. Is a
photo a new Change Request kind, or admin-only on Userless Profiles? What does an Audit Event
record, given ADR 0005 keeps snapshots forever: does the old image survive replacement or profile
deletion?

## Answer

Who:

- Linked profile: its user sets, replaces and removes directly. Owner/admin may remove only (first
  exception to "only its linked user"), with a confirm Dialog and no reason.
- Userless Profile: owner/admin and draft creators change it directly. On an `active` profile, a
  member files a new `photo` Change Request covering set, replace and remove.
- Reassign: photo stays with the profile; pending requests are superseded as usual.
- Create form stays photo-free; photo is set from the profile page afterwards. A rejected draft's
  profile deletion takes the bytes too.

`photo` Change Request:

- Base is the photo at submission; current differs → stale, same as `info` (reject or withdraw
  only, never auto-closed). Reason reads "Changed since requested: Photo".
- Joins overlap warnings and counts toward the pending request limit.
- Proposed image is visible to submitter and owner/admin only; avatar unchanged until approved.
- Review drawer shows current and proposed side by side. Closed requests show "Photo proposed", no
  thumbnail.

Bytes and audit ([ADR 0009](../../../docs/adr/0009-audit-snapshots-cover-text-not-blobs.md)):

- Audit Events and closed requests keep metadata only: blob id, sha256, size, dimensions, who, when.
- Bytes are deleted on replace, remove, profile deletion, or when a request is rejected, withdrawn
  or superseded. Stale requests keep bytes until closed.

AI Clients: no photo tools, no photo in `get_profile`.
