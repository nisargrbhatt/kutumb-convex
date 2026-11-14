# Feed model

Type: grilling Status: resolved Blocked by:

## Question

How do Memory and future kinds of Post share one model? Decide base Post record plus per-kind data,
how likes and comments attach to any kind, how a new kind is added without migrating existing Posts,
cursor pagination (newest first, 10 per page), and the module seam between Feed and each kind.

## Answer

Model ([ADR 0010](../../../docs/adr/0010-feed-post-base-table-plus-kind-tables.md)):

- Base `post` (id, org, kind, author, createdAt) plus one table per kind, `postMemory` first, keyed
  by post id. Kind is fixed at posting. New kind = new table + enum value, no migration of old
  Posts.
- Likes and comments attach to `post`, always on for every kind, no opt-out for now. A poll vote is
  that kind's own data, not a like.
- Gallery belongs to Memory, not Post: each kind owns its media.
- Kind rows, likes and comments cascade from `post` by FK; `post` cascades from org. This covers
  real row deletes only: soft or hard removal is Memory lifecycle, R2 bytes are Blob model.
- Drop the unused `communityMemory` table. Nothing in `src` touches it; confirm empty on prod in the
  migration slice before dropping.

Reading:

- Sorted by posting time. No "happened on" field; edits don't bump a Post.
- Two steps: page from `post`, then one `db.batch` for each kind's `load` plus like and comment
  data. Read live from D1, no KV (ADR 0008).
- Cursor as in audit log: opaque `createdAt:id`, index `(organizationId, createdAt, id)`, page 10,
  fetch 11, `useInfiniteQuery`. No filter by kind.
- No live updates, polling or new-posts banner. Own new Post invalidates the query.
- Detail route is kind-agnostic: `/feed/$postId`.

Seam:

- Server: `Record<PostKind, { load(postIds) }>`. Feed module owns paging, likes, comments, base row.
- Client: `Record<PostKind, { Card, Detail }>`, separate so server code never imports React.
- Each kind has its own create and edit server functions, calling a Feed helper that writes the base
  row in the same batch. No generic `create` in the interface.
- Both records fail to compile until a new kind is handled. A stale client skips an unknown kind's
  card.
