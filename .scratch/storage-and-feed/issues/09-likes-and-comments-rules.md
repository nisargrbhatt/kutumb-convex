# Likes and comments rules

Type: grilling Status: resolved Blocked by: 07

## Question

What are the rules for likes and comments? Flat or threaded, plain text or formatted, length limit,
can a comment be edited, who may remove one, can comments be liked, and how are counts shown and
kept correct on Feed cards?

Likes and comments attach to `post` and are on for every kind: see
[Feed model](07-feed-model.md). Counts load in the Feed's second read step.

Comments and likes outlive their author, and a comment carries a frozen name snapshot with no FK to
`user`: see [Memory lifecycle](08-memory-lifecycle.md). Removing a Post hard-deletes its comments
and likes.

## Answer

Comments:

- Flat, no replies. Plain text, line breaks kept. No auto-linked URLs, no @mentions.
- 1000 chars, trimmed, not empty. No cap per Post or per member.
- No editing, no `editedAt`: author removes and rewrites.
- Removal: comment author while an Org Member, or owner/admin. Not the Post author. Confirm Dialog,
  hard delete, no Audit Event, no trail. Removing an already-removed comment counts as success.
- Live on `/feed/$postId` only, composer above the list. Newest first, 20 per page, opaque
  `createdAt:id` cursor, index `(postId, createdAt, id)`, "Show more" button.
- Posting waits for the server, button disabled, then refetches. Text stays in the box on failure.

Likes:

- One plain like per Org Member per Post, unique on Post + user. No reaction types. Comments can't
  be liked. An author may like their own Post. Any role may like or comment.
- Tapping the count lists who liked: fetched only then, newest first, 50 per page, same cursor. Each
  liker shown by the Memory author rule: Community Profile if visible, else snapshot name and
  initials.
- So a like row also carries a frozen `user.name` snapshot, no FK to `user`, extending
  [Memory lifecycle](08-memory-lifecycle.md), which gave comments one.
- Toggle is optimistic and sends desired state (`liked: true|false`), not a flip. Rolls back on
  failure.

Counts:

- Computed at read: `COUNT ... GROUP BY postId` in the Feed's second batch, plus the viewer's own
  liked state. No stored counter columns, so nothing drifts.
- Cards show counts only. Comment button goes to the detail page.

Post removed mid-action: like or comment shows "This Post was removed" and refreshes. What a stranger
sees on a link belongs to [Share link when another org is active](10-share-link-across-orgs.md).
