# Likes

Status: resolved Blocked by: 29

## What to build

- `postLike` table, frozen `userName`.
- `setLike({ postId, liked })`: desired state, idempotent.
- Like counts and the viewer's liked state in the Feed's second batch.
- Heart and count as two targets, optimistic with rollback.
- Who liked: Dialog, fetched on tap, 50 per page, "Show more", author display helper.

## Spec

[spec.md](../spec.md): Feed > Likes, Feed > Reading, Feed UI (Card action row).

## Done when

- [ ] Sending `liked: true` twice leaves one row. `liked: false` on nothing succeeds.
- [ ] Failure rolls the heart and count back.
- [ ] A like outlives its member, shown by snapshot name.
- [ ] Like on a removed Post shows "This Post was removed" and refreshes.
- [ ] Counts come from `COUNT … GROUP BY`, no counter column.

## Comments

Merged e185e57 on feat/storage-integration.
