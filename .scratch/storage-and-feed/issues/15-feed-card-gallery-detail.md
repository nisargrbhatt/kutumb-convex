# Feed card, gallery and detail page

Type: prototype Status: resolved Blocked by: 07, 08

## Question

How should the Feed look and behave across all breakpoints? Card layout for 1 to 5 mixed media,
stripped description, like, comment and share actions, infinite scroll, the detail page, and the
create Drawer. Includes page breadcrumbs.

Must also cover: zero-media cards, "edited" marker, edit and remove actions by role, and an author
shown as snapshot name and initials with no photo or link: see
[Memory lifecycle](08-memory-lifecycle.md).

Detail page also covers the auto-switch toast and the not-found state: see
[Share link when another org is active](10-share-link-across-orgs.md).

Must also cover: comment list, composer and "Show more" on the detail page, and the who-liked list:
see [Likes and comments rules](09-likes-and-comments-rules.md). Feed cards, comments and likers are
not Table data, an exception to the CLAUDE.md list rule.

## Answer

Variant A, Stream, chosen by the owner. Read as A throughout, detail page included.

Feed:

- One centred column, `max-w-2xl`, at every width. Ultrawide just gets margins.
- Create: "Share a memory" prompt card on tablet and up, a Share button in the header on phone.
- Infinite scroll loads 10 at a time, skeleton while loading, a quiet end line. Empty Feed uses
  `Empty` with a create button. Breadcrumbs: Home > Feed.

Card, top to bottom:

- Author line (avatar, name, time, "· edited") with the actions menu. Then title, stripped text at 3
  lines, gallery, action row.
- Author with no visible profile: snapshot name and initials, plain text, no link.
- Menu shows Edit to the author, Remove to the author and owner/admin. Nothing to show, no menu.
- Gallery mosaic: 1 keeps its shape, ratio held between 4:5 and 1.9:1; 2 side by side; 3 one large
  plus two; 4 a 2x2; 5 two over three. Zero media: no gallery block.
- Video tile: poster, play badge, duration. No poster: placeholder tile.
- Tapping media opens a full-screen lightbox with swipe and a counter. Tapping the title opens
  detail.
- Action row: heart toggles, the count beside it opens who liked, so two tap targets. Comment count
  opens detail and focuses the composer. Share opens the native sheet on touch, else copies the link
  with a toast.

Detail page:

- Same column. Author line and menu, title, full description, gallery, like and share, then
  comments. Breadcrumbs: Home > Feed > title.
- Comment composer above the list, trash icon only where removal is allowed, "Show more" at 20.
- Other-org link: toast naming the community, stays on the Post. Dead link: existing `NotFound`.
- Who liked: a Dialog, "Show more" at 50.

Create and edit Drawer:

- `FormDrawer` size `lg`: title, description with toolbar, gallery grid. Same Drawer for edit.
- Each file shows its own progress bar and inline error. A rejected file blocks posting until
  removed; submit waits for uploads.

Required fix, found in the prototype: `CommunityLayout`'s `main` needs `min-w-0`, or wide content
can stretch the page. Added on the prototype branch only, so the spec must carry it.

Defaults not confirmed by the owner, change if wrong:

- Title required, description optional. Title capped at 120 chars.
- Gallery reorder with earlier and later arrows in the Drawer.
- No alt text field: media gets a generated label ("Photo 2 of 5 in <title>").
- Native share sheet on touch devices.

Not checked: real touch, the signed-in `/memories` page, tablet width. Real touch and signed-in page
are on [Real device and plan checks](17-real-device-and-plan-checks.md). Video in the lightbox is a
mock poster; playback is [Video playback in the Feed](19-video-playback-in-the-feed.md). The
drawer's description is a stand-in: see
[Memory description format](13-memory-description-format.md).

Prototype: commit `c5f9f6b` on local branch `prototype/feed-card-gallery`, all three variants.

## Comments

The prototype hides lightbox previous and next below `md`. They must show at every width. See
[Video playback in the Feed](19-video-playback-in-the-feed.md).
