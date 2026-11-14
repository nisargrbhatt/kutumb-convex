# Comments

Status: resolved Blocked by: 30

## What to build

- `postComment` table, frozen `authorName`.
- Create, list, remove. Trimmed, 1000 chars. `canRemoveComment` from the Feed policy.
- Composer above the list on `/feed/$postId`, text at least 16 px, newest first, 20 per page, "Show
  more". Trash icon only where allowed, confirm Dialog.
- Comment count on cards. Comment button opens detail and focuses the composer.

## Spec

[spec.md](../spec.md): Feed > Comments, Feed > Reading, Feed UI (Card action row, Detail).

## Done when

- [ ] Empty, whitespace-only and 1001-char comments are rejected.
- [ ] Line breaks kept; URLs stay plain text.
- [ ] Post author gets no extra removal right. Comment author and owner/admin do.
- [ ] Removing a removed comment succeeds.
- [ ] Text stays in the box on failure.
- [ ] A comment on a removed Post shows "This Post was removed" and refreshes.

## Comments

Merged efa91ee on feat/storage-integration.
