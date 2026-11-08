# Feed skeleton with text-only Memory

Status: ready-for-agent Blocked by:

## What to build

Tracer through the whole Feed: post a text-only Memory, see it in the Feed, open its detail page.
Largest slice; it fixes the seam the rest hang on.

- `/memories` to `/feed` and `/feed/$postId` under `_authed/_community`. Nav entry becomes Feed.
  Stub deleted, no redirect. `routeTree.gen.ts` regenerates, never by hand.
- `CommunityLayout`'s `main` gains `min-w-0`.
- Tables `post`, `postMemory`; enum `POST_KIND`. Drop `communityMemory`.
- Seam: server `Record<PostKind, { load(postIds, view) }>`, client `Record<PostKind, { Card, Detail
  }>`.
- Feed read: two steps, `createdAt:id` cursor, page 10 fetch 11, `useInfiniteQuery`. Keys in
  `src/queries/keys.ts`.
- Author display helper on `visibleProfileWhere`, with snapshot fallback. Reused by
  [Likes](31-likes.md) and [Comments](32-comments.md).
- Pure description module: `marked` config, allowlist, strip. Add `marked`.
- `createMemory`, using a Feed helper for the base row. Drawer with toolbar, Write and Preview.
- Feed page, card without gallery or action row, detail page, `Empty`, skeleton, breadcrumbs.

Detail read is org-scoped here. [Share link](33-share-link.md) replaces it with the cross-org read. Cards show no menu, likes or
comments yet.

## Spec

[spec.md](../spec.md): Feed (Schema: `post` and `postMemory`, Seam, Reading, Memory description,
Routes), Feed UI (Feed, Card, Detail, Drawer), Unconfirmed defaults.

## Done when

- [ ] A member posts a text-only Memory; it's live at once at the top of the Feed.
- [ ] Infinite scroll loads 10 at a time; cursor test against ties on `createdAt`.
- [ ] Author with no visible profile shows snapshot name and initials, no link, no photo.
- [ ] Description tests: `[x](javascript:…)`, `![a](url)`, `<b>x</b>`, `> quote` show literally; `1.
  1. 1. …` at 5,000 chars blocks the save; lists past 3 levels block the save; `#` is `h2`.
- [ ] Card `load` selects `descriptionText` only; detail selects `descriptionDoc`.
- [ ] Client-sent `descriptionDoc` or `descriptionText` is ignored.
- [ ] `marked` works under `npm run build` and in local dev: on the not-verified list.
- [ ] Responsive at phone, tablet, desktop, ultrawide. No horizontal page scroll.

## Human step

Before deploy: confirm `communityMemory` is empty on prod.
