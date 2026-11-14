# Feed Posts: base `post` table plus one table per kind

A Post is one row in `post` (id, org, kind, author, createdAt) plus one row in a table for its kind
(`postMemory` first), keyed by post id. Likes and comments reference `post`. A new kind is a new
table and a new enum value; existing rows are untouched. A Post's kind never changes.

- **Rejected: one table with a JSON `payload`**, the `changeRequest` pattern. That payload is a
  short-lived proposal; a Post lives forever, so the Worker would validate every old payload shape
  for good, and kind fields could not be queried or constrained.
- **Rejected: separate tables with no base.** The Feed would need a UNION across kinds, and likes
  and comments would have no single target.
- **Consequences**: a Feed page takes two D1 round trips: read `post`, then one batch loading each
  kind's rows. Rejected LEFT JOIN of every kind table: it widens with each kind and leaks kind
  columns into Feed code. The seam stays small, one `load(postIds)` per kind, until a second kind
  shows what else really varies.
