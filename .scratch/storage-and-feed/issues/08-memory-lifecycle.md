# Memory lifecycle

Type: grilling Status: resolved Blocked by:

## Question

What can happen to a Memory over time? Who may post, is there any approval, can the author edit
after posting, are there drafts, who may remove it (owner/admin moderation), and is removal soft or
hard? What happens to Memories and comments when the author leaves the org, is removed, or deletes
their account, given `user` cascades and ADR 0005 prefers snapshots to FKs?

Author and removal fields land on base `post`, so they serve every kind: see
[Feed model](07-feed-model.md).

## Answer

Posting:

- Any Org Member, any role, posts a Memory. Live at once: no approval, no drafts. Closing the create
  Drawer discards the form.
- Gallery is 0 to 5 media. A text-only Memory is valid, and an edit may empty the gallery.

Editing:

- Author only, any time, while still an Org Member: title, description, gallery. Owner/admin can't
  edit someone else's Memory.
- "Edited" marker from `editedAt` on `post`. No version history, no `version` column: last write
  wins.
- Media removed in an edit has its bytes deleted.

Removal:

- Author or owner/admin, via a confirm Dialog, no reason.
- Hard delete: rows, likes and comments cascade, bytes deleted. No undo, no Audit Event, no trail.
  Audit Events stay about Community Profiles. Add a trail only if moderation disputes appear.

Author leaves, is removed, or their account goes:

- Memories, comments and likes stay. No FK to `user`: `authorUserId` plus `authorName`, a frozen
  `user.name` at posting, same as `auditEvent.actorName` (ADR 0005). Same for comments.
- Display: the author's Community Profile if the viewer can see it, else snapshot name and initials,
  no photo, no link. Covers `inactive` and deleted profiles.
- An ex-member can't edit or remove; only owner/admin can remove their content. Rejoining with the
  same user id restores edit and remove.
- Removing a member leaves their Posts. Owner/admin remove them one by one, no bulk option.
- Account deletion doesn't exist today. If added, same rule; erasure stays deferred per ADR 0005.
  Note `communityProfile.userId` cascades, so the linked profile would go and display falls back to
  the snapshot.
