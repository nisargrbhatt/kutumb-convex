# Storage and Feed: spec

Private blob storage on R2, Profile Photos with crop, and the Feed with Memory as its first kind of
Post. Terms per `GLOSSARY.md`. Decisions live in the tickets at `issues/` and ADRs 0009 to 0012;
this spec merges them with every later comment applied. **Where a ticket answer and this spec
differ, the spec wins.**

Each section links its source tickets. Things no ticket decided are marked **[filled]** and listed
in [Gaps this spec filled](#gaps-this-spec-filled).

## Constraints

- R2 + Workers only. No Cloudflare Images, no Stream, no transcoding.
- Design to Workers Free: 10 ms CPU, 50 subrequests, 100,000 requests a day. Zone is Free: 100 MB
  body cap. If production shows Error 1102 or 1027, Workers Paid is the first add-on to propose.
- No real-device or deploy checks. Prefer restricting a feature over depending on the unverified.
- Worker never copies or rewrites bytes. Browser strips, Worker verifies and rejects.
- Every blob is private to its org. No public URLs, no presigned URLs.
- Media failure degrades: avatar to initials, gallery image to placeholder, video to poster plus
  download link. No gesture-only path.

Sources: [Real device and plan checks](issues/17-real-device-and-plan-checks.md).

## Blobs

Sources: [Blob model](issues/11-blob-model.md),
[Upload limits and storage quotas](issues/12-upload-limits-and-quotas.md),
[Cancelled Memory edit](issues/20-cancelled-memory-edit.md), ADR 0011.

### Record

One piece of media is one `blob` row. Immutable: a new crop is a new Blob. No dedupe, no original
kept. "Blob" is internal, never shown to members, no glossary entry.

| Column                 | Notes                                                                    |
| ---------------------- | ------------------------------------------------------------------------ |
| `id`                   | Global, unguessable                                                      |
| `organizationId`       | No FK: org delete must not take the rows that locate the bytes           |
| `mediaKind`            | `profilePhoto \| memoryImage \| memoryVideo` **[filled]**, sets variants |
| `status`               | `pending \| attached \| deleted`                                         |
| `ownerKind`, `ownerId` | `profile \| memory \| changeRequest`, no FK, null while `pending`        |
| `uploadedByUserId`     | No FK                                                                    |
| `size`                 | Reservation while `pending`, real sum of landed variants once attached   |
| `variants`             | JSON: landed variants and their real sizes                               |
| `width`, `height`      | Worker-read, never from the client. Video has `tkhd` rotation applied    |
| `durationMs`           | Video only, Worker-read                                                  |
| `contentType`          | Video only: `video/mp4 \| video/quicktime`, allow-listed **[filled]**    |
| `sha256`               | `profilePhoto` only, of `display` (ADR 0009) **[filled]**                |
| `createdAt`            | `pending` expires 24h after this                                         |

Indexes: `(organizationId, status)`, `(organizationId, uploadedByUserId, status)`,
`(status, createdAt)` for the sweep. New enums go in `src/db/constants.ts`.

Owning record says what's current (`communityProfile.photoBlobId`, gallery row, `photo` Change
Request payload). Blob holds owner fields for the gate and cleanup. Both directions on purpose.

### Variants

Objects under one Blob. R2 key `<orgId>/<blobId>/<variant>`, stable from upload to delete: the
binding has no `copy()`, so no pending prefix.

| `mediaKind`    | Required                                 | Optional         |
| -------------- | ---------------------------------------- | ---------------- |
| `profilePhoto` | `avatar` 128 px, `display` up to 1024 px |                  |
| `memoryImage`  | `thumb` 640 px, `display` 2048 px        |                  |
| `memoryVideo`  | `video` **[filled]**                     | `poster` 1280 px |

Sizes are longest edge, never upscaled. Image variants are JPEG. `poster` is optional because a
browser that can't decode a clip can't draw one.

### Lifecycle

`pending → attached → deleted`.

- **Attach** only inside the owner's server function, in its `db.batch`. Requires `pending`, Actor's
  active org, uploaded by that Actor, `mediaKind` fits the slot, required variants landed. Attaches
  once. Only exception: approving a `photo` Change Request moves the owner fields, no byte copy.
- **Delete:** the owning change marks Blobs `deleted` in its `db.batch`, then `waitUntil` deletes
  bytes; the row goes once R2 confirms. D1 first, so a live record never lacks bytes. Audit Events
  keep their metadata copy.
- **Discard** (`pending` only, Actor's own, ids sent by the browser): one server function for create
  and edit. A stale or repeated call can't touch attached media. Leaves the pending sum at once.
  - Any Drawer close without a save: Cancel, X, Esc, overlay, all through `FormDrawer`'s
    `handleOpenChange`. Close aborts running uploads, then discards ids uploaded since it opened.
  - A `pending` file removed in the Drawer is discarded on click. An `attached` file is marked on
    save, because Cancel must restore it.
  - Tab close, refresh, crash: nothing sent, falls to 24h expiry. No `pagehide` beacon, no
    unsaved-changes guard.

### Sweep

`scheduled`, hourly (`0 * * * *`), at most 40 subrequests per run, capped per run. Use R2 bulk
`delete(keys)`.

1. Expire `pending` older than 24h.
2. One rule: an `attached` Blob whose owner row is gone is `deleted`. Each owner kind supplies its
   check, as a `Record<ownerKind, …>` so a new kind fails to compile. Covers org delete with no
   hook, and anything that forgets to mark, such as account deletion cascading a linked profile.
3. Retry byte deletes on `deleted` rows.

Cron with assets is unverified in prod. Nothing may depend on it running: the pending cap counts
only unexpired rows, so a missed cron can't lock a member out.

### R2

- One private bucket `kutumb-blobs`, location hint `apac`, binding `BLOBS`. Local Uploads off.
- `vite dev` uses Miniflare local R2. `remote: true` never set.
- `wrangler.jsonc` has no `cache` block: Workers Cache serves hits without running the gate. Keep it
  that way.

## Upload

Sources: [Upload path to R2](issues/01-r2-upload-path.md),
[Upload limits and storage quotas](issues/12-upload-limits-and-quotas.md),
[Server-side blob verification](issues/03-server-side-blob-verification.md),
[Real device and plan checks](issues/17-real-device-and-plan-checks.md).

Every file is one `put()`. No multipart, no resume: a dropped connection restarts the file.

1. **Start** (`createServerFn`, `orgMiddleware`): declares `mediaKind` and total size. Checks
   per-file caps and the pending cap, inserts a `pending` row reserving the size, returns its id.
2. **Put** each variant: `PUT /api/blob/<orgId>/<blobId>/<variant>` in `src/server.ts`, ahead of
   TanStack **[filled]**: `createServerFn` reads the whole body first. Session, membership and row
   are read live, no memo. Checks: same-origin `Origin` **[filled]**, row `pending`, uploaded by
   this user, variant allowed, `Content-Length` present and within caps. Then `put(request.body)`,
   with `sha256` from a request header for `profilePhoto` `display`, so R2 rejects a mismatch at no
   Worker CPU **[filled]**.
3. **Verify** by header and range reads. A bad file is deleted and rejected. `head()` confirms size:
   over declared means delete and fail.
4. **Re-read the row.** No longer `pending` means delete the bytes: otherwise a late `put()` after a
   discard leaves bytes with no row, which the sweep can't find. Else record the variant.

### Limits

All in `src/domain/limits.ts`, same constants in browser and Worker.

| Limit                  | Value                                         |
| ---------------------- | --------------------------------------------- |
| Video                  | 120 s, 95,000,000 bytes, longest edge 4096 px |
| Video types            | `.mov`, `.mp4`; codec `avc1`, `hvc1`, `hev1`  |
| Image variant (Worker) | 5 MiB                                         |
| Picked photo (browser) | 50 MiB; JPEG, PNG, WebP, HEIC. No GIF, no SVG |
| Pending bytes          | 500 MB per Org Member, unexpired rows only    |
| Gallery                | 0 to 5 media                                  |
| Memory title           | 120 chars, required (unconfirmed)             |
| Memory description     | 5,000 chars on the source, optional           |
| Comment                | 1000 chars, trimmed, not empty                |

No org cap, no per-member cap on attached bytes, no rate limit binding (ADR 0011). 95 MB leaves
margin under the zone's unverified 100 MB edge. A Cloudflare `413` shows the same size message.
Rejection copy leads with size: size is the real limit, about 1:35 at 1080p30 or 33 s at 4K30
(estimates).

**Hitting a limit.** Per-file checks run in the browser, inline on that gallery item; the Worker
re-checks. Pending cap throws `LimitError` kind `pendingUpload`, with `LIMIT_COPY`, the usual
PostHog capture, and a new `Counters` member pending byte sum. ADR 0003's race overshoots by up to
one file: harmless.

### Photos in the browser

- `accept="image/*,.heic,.heif"` on every browser, so a HEIC file can be picked and the rejection
  can explain itself. Size and type are checked on the picked file, with no assumption on what a
  phone delivers.
- `createImageBitmap` is the only decode test, capped at 2048 px, which bakes EXIF orientation. No
  browser sniffing. Canvas exports JPEG; check `blob.type`, since `toBlob` silently falls back to
  PNG.
- **Strip the export.** Walk markers to SOS and drop every APPn except APP0, plus COM, into a new
  `Blob` from slices. Required: WebKit's canvas JPEGs carry APP1 Exif and APP13 Photoshop blocks, so
  without this every Safari and iPhone photo fails verification. See
  [Gaps this spec filled](#gaps-this-spec-filled).
- Two messages, with the upload constants, inline. Other gallery items carry on:
  - HEIC, known by type, extension or `ftyp` brand: "This browser can't open HEIC photos. Export it
    as JPEG, or upload from an iPhone or Safari."
  - Anything else: "This photo couldn't be read. Try a different file."

No `heic-to`, no paid conversion. It can be added later with no migration, as the Worker only sees
JPEG. Source:
[HEIC on browsers that can't read it](issues/16-heic-on-browsers-that-cant-read-it.md).

### Video in the browser

- Check size and walk atoms with the same pure module the Worker uses, reading `File` slices. Reject
  inline on type, codec, duration or size. No in-app trim.
- Rename `meta` and `udta` to `free` in a new `Blob` built from `File` slices. No remux.
- `poster`: draw a frame to canvas, then strip as above. A failure just means no poster.

HEVC stays accepted with no warning to the uploader: iPhones record it by default.

### Worker verification

Pure modules taking a `readRange(offset, length)`, so tests use fixtures and CPU stays flat with
file size.

- **JPEG:** starts `FFD8`, walks markers to SOS. Rejects any APPn other than APP0 and any COM before
  SOS. Size from SOF: longest edge within the variant's limit. `display` width and height go on the
  Blob. Missing SOS within a capped read: reject.
- **Video:** walks atoms within a capped number of range reads (about 12 on a 319 MB `.mov`). `ftyp`
  brand, `stsd` codec, `mvhd` duration, `tkhd` size and rotation. Rejects leftover location data.
  Can't prove the bitstream decodes: that's what the playback failure path is for.

## Serving

Sources: [Serving private blobs](issues/02-serving-private-blobs.md),
[Blob model](issues/11-blob-model.md),
[Real device and plan checks](issues/17-real-device-and-plan-checks.md).

`GET /api/blob/<orgId>/<blobId>/<variant>` in `src/server.ts`, ahead of TanStack. Stable URL, built
on the client from org id and blob id, so cached data holds ids only.

### Gate

- Checks membership of the Blob's owning org (the URL's), **never the active org**: a tab left open
  after an auto-switch keeps working.
- Non-member, wrong org, missing Blob: one identical `404`. `pending` is never served, even to its
  uploader: the browser previews the local file.
- Isolate memo, about 30 s, plain data only:
  - `sha256(session cookie) → { userId, role per org }`.
  - `orgId → Set(restricted blob ids)`: `pending`, `deleted`, Change Request owned, photos on
    `inactive` or `draft` profiles.
- Unrestricted plus member: serve with no D1 read. Restricted: full owning-record check.
  - Photo: `visibleProfileWhere(actor)`.
  - Change Request: submitter or owner/admin.
- Accepted: 30 s memo lag, 1-day browser `max-age` for removed members.

### Response

- `Cache-Control: private, max-age=86400, immutable`, plus `ETag`. Errors send `private` or
  `no-store`. No Cache API in v1.
- Revalidation does an R2 `head()`, `404` if gone, then `304`. Never `304` from the ETag alone: once
  the row is gone a member would get `304` forever, breaking ADR 0009.
- `Content-Type` from the allow-list, never the client's raw value: `image/jpeg` for image variants,
  stored `video/mp4` or `video/quicktime` for `video`. Set in `put()` `httpMetadata` from the row,
  so the memo path needs no D1.
- `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox` **[filled]**.
- `Clear-Site-Data: "cache"` on sign-out, best effort **[filled]**: the browser cache isn't per
  user.
- `?download=1` adds `Content-Disposition: attachment`, no filename. The anchor's `download`
  attribute names it, so the route needs no title lookup.

### Range

`video` needs a hand-built `206`: WebKit opens with a `0-1` probe, and R2's example returns `200`.
Parse one `Range` into `R2Range`; multi-range gets `200`. Handle `If-Range` by ETag compare. Stream
`object.body` straight through.

## Profile Photo

Sources: [Who can change a Profile Photo](issues/06-who-can-change-a-profile-photo.md),
[Profile Photo crop editor](issues/14-profile-photo-crop-editor.md),
[Crop library options](issues/04-crop-library-options.md), ADR 0009.

Belongs to the Community Profile, per org. `user.image` stays as is. New column
`communityProfile.photoBlobId`, no FK.

### Who

- **Linked profile:** its user sets, replaces and removes directly. Owner/admin may remove only, via
  confirm Dialog, no reason (`communityProfile: ["removePhoto"]`).
- **Userless Profile:** owner/admin and draft creators change it directly, on the `isReviewer` path.
  On an `active` profile, a member files a `photo` Change Request.
- Reassign: photo stays with the profile; pending requests are superseded as usual.
- Create form stays photo-free. A rejected draft's deletion takes the bytes.
- AI Clients: no photo tools, no photo in `get_profile` or `get_family_graph`. Their output schemas
  are explicit, so keep `photoBlobId` out.

### Through the change seam

All changes are plans in `makeProfileChanges`, so `version` and `orgDataVersion` bump in the same
batch (ADR 0008) and the graph stays correct.

- Audit Event `profile.photo_changed` **[filled]**, payload `[before, after]`, each null or metadata
  only: blob id, sha256, size, dimensions. Category `profile` by prefix.
- `planDelete` marks the Blob `deleted`, and its `profile.deleted` snapshot carries the photo
  metadata. All profile deletes pass through it.
- Replaced or removed Blob is marked `deleted` in the same plan.

### `photo` Change Request

- `CHANGE_REQUEST_KIND.photo`, one kind for set, replace and remove. Payload: base blob id and
  proposed blob id, either null. New cases in `staleReason`, `requestDiff` and
  `ChangeRequestPayload`.
- Base differs from current: stale, as `info`: "Changed since requested: Photo". Reject or withdraw
  only, never auto-closed.
- Joins overlap warnings, counts toward the pending request limit.
- Proposed image: visible to submitter and owner/admin only. Avatar unchanged until approved.
- Review drawer shows current and proposed side by side. Closed requests show "Photo proposed", no
  thumbnail.
- Bytes deleted on rejected, withdrawn, superseded. Stale keeps bytes until closed.

### Crop editor

Variant C, the workspace. Reference: commit `8be8d3d` on local branch `prototype/profile-photo-crop`
(throwaway, never merge).

- `react-easy-crop`, plus our ~25-line canvas export, aria props and sliders.
- Wide right-side Drawer (`lg`): crop stage left, "Where it shows" previews right. On phone, stage
  and controls first, previews below, footer sticky.
- Opened from "Add photo" or "Edit photo" on the profile header. Remove is a separate icon button
  with the confirm Dialog.
- Square crop, thirds grid. Circles are only how avatars render.
- Zoom and Straighten tabs. Zoom 1x to 4x, straighten -45° to 45°, plus 90° left and right. "Choose
  another" in the footer. Sliders mean no gesture-only path. Stage sets `touch-action: none`.
- Live previews at real sizes: list row, profile header, community tree, square full view, from a
  512 px copy.
- **Required fix:** minimum zoom rises with the angle so the crop stays inside the photo. The
  prototype leaves white wedges at low zoom.

### Where it shows

- `ProfileAvatar` gains `photoBlobId`: every read feeding it selects the column. `AvatarImage` falls
  back to initials on error.
- `community-tree` raw `Avatar` and `ProfileAvatar`: blob id rides the graph blob
  (Actor-independent, ADR 0008). Mount `<img>` only at zoom 0.5 and above **[filled]**, initials
  below: the biggest saving on requests and D1.
- `AuthUser` sidebar: the active org's linked profile photo when one exists, else `user.image`.
- Lists use `avatar`. Profile header uses `display` (unconfirmed).

## Feed

Sources: [Feed model](issues/07-feed-model.md), [Memory lifecycle](issues/08-memory-lifecycle.md),
[Likes and comments rules](issues/09-likes-and-comments-rules.md),
[Feed permission statements](issues/18-feed-permission-statements.md), ADR 0010.

### Schema

- `post`: `id`, `organizationId` (FK cascade), `kind`, `authorUserId`, `authorName`, `createdAt`,
  `editedAt`. Index `(organizationId, createdAt, id)`.
- `postMemory`: `postId` (PK, FK cascade), `title`, `description`, `descriptionDoc`,
  `descriptionText`.
- `postMemoryMedia`: `postId` (FK cascade), `blobId`, `position`.
- `postLike`: `id`, `postId` (FK cascade), `userId`, `userName`, `createdAt`. Unique
  `(postId, userId)`, index `(postId, createdAt, id)`.
- `postComment`: `id`, `postId` (FK cascade), `authorUserId`, `authorName`, `body`, `createdAt`.
  Index `(postId, createdAt, id)`.

No FK to `user` anywhere: names are frozen `user.name` snapshots, as `auditEvent.actorName`. No
`version` column: last write wins. Kind is fixed at posting. Drop the unused `communityMemory`
table: confirm it's empty on prod in that migration's slice first.

### Seam

- Server: `Record<PostKind, { load(postIds, view) }>`, `view` being `card | detail` **[filled]**:
  cards never select the tree or source. Feed module owns paging, likes, comments, base row.
- Client: `Record<PostKind, { Card, Detail }>`, separate so server code never imports React.
- Each kind has its own create and edit server functions, calling a Feed helper that writes the base
  row in the same batch. No generic `create`.
- Both records fail to compile until a new kind is handled. A stale client skips an unknown card.
- A new kind is a new table plus enum value, with no migration of old Posts. Likes and comments
  attach to `post`, on for every kind. Media belongs to the kind.

### Reading

- Sorted by posting time. Edits don't bump a Post. No filter by kind, no KV, no polling, no
  new-posts banner. Own new Post invalidates the query.
- Two steps: page from `post`, then one `db.batch` for each kind's `load`, like counts, comment
  counts, the viewer's liked state, and authors.
- Opaque `createdAt:id` cursor as in audit log, page 10, fetch 11, `useInfiniteQuery`.
- Counts are computed at read, `COUNT … GROUP BY postId`. No counter columns.
- **Author display** (Posts, comments, likers): the Community Profile if
  `visibleProfileWhere(actor)` finds it, else snapshot name and initials, no photo, no link.

### Memory lifecycle

- Any Org Member, any role, posts. Live at once: no approval, no drafts. Closing the create Drawer
  discards the form. Text-only is valid; an edit may empty the gallery.
- Edit: author only, any time, while an Org Member: title, description, gallery. "Edited" from
  `editedAt`. No version history. Media removed is marked on save.
- Remove: author or owner/admin, confirm Dialog, no reason. Hard delete: rows cascade, Blobs marked
  `deleted` in the batch, no undo, no Audit Event, no trail.
- Author leaves: Memories, comments and likes stay. Removing a member leaves their Posts;
  owner/admin remove one by one, no bulk. Rejoining with the same user id restores rights.

### Permissions

`src/domain/permission.ts`, with both in `permission.test.ts`:

- `post: ["moderate"]`, owner and admin: remove anyone's Post or comment. No `comment` resource. No
  role hierarchy, so an admin may remove an owner's Post.
- `communityProfile: ["removePhoto"]`, owner and admin.

No statement for posting, liking, commenting or uploading: `orgMiddleware` membership is the gate.

Pure, client-safe Feed policy, used by server and UI through `useActor`:

- `canEditPost`: author only.
- `canRemovePost`: author, or `post: ["moderate"]`.
- `canRemoveComment`: same rule. Post author gets no extra right.

Compare `actor.userId` with `authorUserId`, no ex-member logic. `can()` looks at role only, so every
Feed write loads by id + `actor.organizationId` first: another org's row is `NotFound` before the
policy runs. Code goes through `can` / `assertCan`.

### Likes

- One plain like per Org Member per Post. No reaction types. Comments can't be liked. Authors may
  like their own. Any role.
- Toggle is optimistic and sends desired state (`liked: true|false`), not a flip. Rolls back on
  failure.
- Who liked: Dialog, fetched only on tap, newest first, 50 per page, same cursor, "Show more".

### Comments

- Flat, plain text, line breaks kept. No auto-links, no @mentions. No cap per Post or member. No
  editing.
- Removal: comment author while an Org Member, or owner/admin. Confirm Dialog, hard delete, no Audit
  Event. Removing an already-removed comment counts as success.
- On `/feed/$postId` only, composer above the list, text at least 16 px. Newest first, 20 per page,
  same cursor, "Show more".
- Posting waits for the server, button disabled, then refetches. Text stays on failure.

Post removed mid-action: like or comment shows "This Post was removed" and refreshes.

### Memory description

Source: [Memory description format](issues/13-memory-description-format.md), ADR 0012.

Native textarea + Markdown, parsed once at save.

- `description`: source of truth, loaded by edit. `descriptionDoc`: JSON tree of our own node shape,
  read by detail. `descriptionText`: stripped, capped at 300 chars, read by cards. All
  Worker-written; nothing derived is accepted from the client. A render rule change re-derives from
  `description`.
- One pure shared module does parse, allowlist and strip, no `@/lib` or server imports. Worker and
  Preview both call it.
- `marked` with `gfm` and `breaks: true`. Blockquote, code, fences, HTML, table, hr, setext heading,
  reference link, tag, codespan and strikethrough tokenizers off.
- Allowed: paragraphs, line breaks, bold, italic, bullet and numbered lists to 3 levels, links,
  headings. `#` renders `h2`, `##` and deeper `h3`.
- Links: `http`, `https`, `mailto`, checked case-insensitively by us: `marked` keeps `javascript:`.
  Pasted URLs auto-link. New tab, `rel="noopener noreferrer"`.
- Anything else shows literally. No remote image is ever fetched.
- A parser throw or lists past 3 levels block the save with one inline error. Preview shows the
  same.
- Read pages: small recursive React mapping, no parser, no `dangerouslySetInnerHTML`.
- Drawer: Write and Preview tabs. Toolbar Heading, Bold, Italic, Bullet list, Numbered list, Link,
  via `setRangeText`. `register` from react-hook-form. Text at least 16 px. `marked` loads lazily
  with the Drawer.
- One shared content class styles Preview and detail: Preflight strips heading sizes and list
  markers. No `@tailwindcss/typography`.

### Routes

- `/memories` becomes `/feed` and `/feed/$postId` under `_authed/_community`. Nav entry becomes
  Feed. The stub goes, no redirect: nothing links to it **[filled]**. Public marketing copy on
  memories stays accurate and stays.
- `CommunityLayout`'s `main` needs `min-w-0`, or wide content stretches the page. On the prototype
  branch only.

### Share link

Source: [Share link when another org is active](issues/10-share-link-across-orgs.md).

- Plain `/feed/$postId`, no org in the URL. One small read skips active org scoping: looks up the
  Post's org and checks membership itself, with `authMiddleware`, not `orgMiddleware`.
- Member with another org active: loader only reports "other org". The **page component** does the
  switch and stays on the Post, with a toast naming the community: `defaultPreload: "intent"` runs
  loaders on hover, and a loader must not change session state. Other tabs move too. Accepted.
- Non-member, ex-member, invitee, removed Post, unknown id: one identical `NotFound`, same server
  response.
- Signed out: login with `redirectTo`. Zero orgs: onboarding, link dropped.
- Page `head` stays generic.

## Feed UI

Sources: [Feed card, gallery and detail page](issues/15-feed-card-gallery-detail.md),
[Video playback in the Feed](issues/19-video-playback-in-the-feed.md).

Variant A, Stream. Reference: commit `c5f9f6b` on local branch `prototype/feed-card-gallery`
(throwaway, never merge). Feed cards, comments and likers are not Table data: an exception to the
CLAUDE.md list rule.

**Feed.** One centred column, `max-w-2xl`, at every width. "Share a memory" prompt card on tablet
and up, Share button in the header on phone. Infinite scroll, skeleton, quiet end line. Empty Feed
uses `Empty` with a create button. Breadcrumbs: Home > Feed.

**Card,** top to bottom:

- Author line (avatar, name, time, "· edited") with actions menu. Edit to the author, Remove to the
  author and owner/admin; nothing to show, no menu.
- Title, `descriptionText` at 3 lines, gallery, action row.
- Mosaic: 1 keeps its shape, ratio held between 4:5 and 1.9:1; 2 side by side; 3 one large plus two;
  4 a 2x2; 5 two over three. Zero media: no block. Ratios come from Blob `width` and `height`, so it
  works with no poster.
- Video tile: poster, play badge, duration. No poster: placeholder tile, same badge.
- Tap media: lightbox. Tap title: detail.
- Action row: heart toggles, the count beside it opens who liked. Two targets. Comment count opens
  detail and focuses the composer. Share opens the native sheet on touch, else copies with a toast.

**Lightbox.** Full screen, swipe, counter. Visible previous, next and close at every width. The
prototype hides previous and next below `md`: don't carry that.

**Video.** Plays in the lightbox only.

- Cards never play. No autoplay, muted or otherwise, no loop. Poster with native `controls`, member
  presses play, sound on.
- `preload="none"`, `playsinline`. `<video>` mounted on the current slide only, no neighbour
  prefetch. Leaving unmounts it, which stops the download; coming back restarts at 0.
- Once started, swipe is off on that slide so scrubbing can't turn the page.
- No poster: play is still offered.
- Failure: the `error` event, or `loadedmetadata` with `videoWidth === 0`. No `canPlayType`
  pre-check. Slide shows poster or placeholder, "This video can't play in this browser." and a
  download link (`?download=1`, anchor `download="<title>-2.mov"`). Link shows on failure only.

**Detail.** Same column. Author line and menu, title, full description, gallery, like and share,
then comments. Trash icon only where removal is allowed. Breadcrumbs: Home > Feed > title. Dead
link: existing `NotFound`.

**Create and edit Drawer.** `FormDrawer` size `lg`: title, description with toolbar, gallery grid.
Same Drawer for edit. Each file shows its own progress bar and inline error. A rejected file blocks
posting until removed; submit waits for uploads.

## Storage used

`getOrgUsage` and the settings overview show storage used as a plain number, no limit bar:
`SUM(size)` of `attached` Blobs for the org. From day one, because adding a cap later strands any
org over it.

## Unconfirmed defaults

Change any of these if wrong. None were confirmed by the owner.

- Title required, description optional. Title capped at 120 chars.
- Gallery reorder with earlier and later arrows in the Drawer.
- No alt text field: media gets a generated label ("Photo 2 of 5 in <title>").
- Native share sheet on touch devices.
- Profile header uses `display`: it's 80 px wide, so 128 px is soft on a 2x screen.
- A `photo` Change Request uses the crop editor, with the button reading "Send for review".

## Gaps this spec filled

Decided here, not in a ticket. Veto any.

- **WebKit JPEGs carry metadata.** Ticket 17 says canvas JPEGs carry none, and the Worker rejects
  any APP1. Probed WebKit on macOS 26 with `canvas.toBlob`: every JPEG has a 76-byte APP1 Exif and a
  56-byte APP13. As written, every Safari photo would be rejected, and iPhone browsers are WebKit in
  practice. So the browser strips them. Probe of the strip: 136 bytes gone, decodes, sampled pixel
  identical. iOS itself not run, but the strip works whatever the encoder emits.
- **`sha256`.** ADR 0009 needs it, but hashing in the Worker grows CPU with file size. Browser sends
  it, `put({ sha256 })` validates it. Local Miniflare behaviour not checked.
- **Upload route in `src/server.ts`,** same path as the read route, with a same-origin `Origin`
  check. Ticket 17 only placed the read route.
- **`mediaKind`, `contentType` columns, and a `video` variant name.** Tickets assumed them.
- **`load(postIds, view)`.** ADR 0010 has `load(postIds)`, but detail needs `descriptionDoc` and
  cards must not read it.
- **`profile.photo_changed`** as the audit action name and payload.
- **Tree threshold** zoom 0.5, a guess. Tune in local dev.
- **Hardening headers.** `nosniff`, `CSP: sandbox`, `Clear-Site-Data` were research suggestions no
  ticket ruled on.
- **`/memories` has no redirect.** It was a stub.
- **Memo blind spot.** A Blob newer than the memo isn't in the restricted set yet, so for up to 30 s
  it reads as unrestricted. Only its uploader knows the id, and ids are unguessable. Accepted.

## Not verified

- Real touch anywhere: crop, mosaic, lightbox, toolbar, phone keyboard.
- `<video>` with the HttpOnly cookie on a real iPhone. Failure path covers it.
- Whether a real iPhone's WebKit emits the same JPEG blocks. Strip doesn't depend on it.
- `marked` under the project's Vite build. CPU of a hostile save in workerd: harm stays on that
  request.
- `scheduled` in prod with assets. Local run needed `assets` removed.
- 95 MB `put()` on a deployed Worker, and CPU per blob request.
- D1 load of a cold 1000-node tree.

## Docs to update alongside

- `CLAUDE.md`: permission checks use `can` / `assertCan`, not `auth.api.hasPermission`.
- `src/routes/(public)/privacy-policy`: already mentions photos and memories. Check it still reads
  true once R2 holds them.

## Slicing order

Tickets at `issues/22` to `issues/36`, `Status: ready-for-agent`. `01` to `21` are this map's
decisions. Vertical slices, each demoable or test-proven. Sign-in checks use local dev with mobile
emulation.

| #   | Slice                                                                                                                                                           | Blocked by |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 22  | Server entry: `src/server.ts` `fetch` + `scheduled`, `main`, cron, `BLOBS` binding                                                                              | none       |
| 23  | Image upload and gated read: `blob` table, limits, start, PUT, JPEG walk, discard, GET full check, headers, 304                                                 | 22         |
| 24  | Profile Photo, linked user: crop editor, browser strip, plans, audit, `ProfileAvatar`, profile header                                                           | 23         |
| 25  | Memo and sweep: isolate memo, restricted set, `profile` owner check, hourly job                                                                                 | 24         |
| 26  | Userless and moderation: reviewer path, draft creators, `removePhoto`, `planDelete` bytes, reassign                                                             | 24         |
| 27  | `photo` Change Request: kind, stale, overlap, review drawer, owner move on approve, `changeRequest` owner check                                                 | 26         |
| 28  | Avatars everywhere: lists, tree with zoom threshold, sidebar, MCP stays photo-free                                                                              | 24         |
| 29  | Feed skeleton: route move, nav, `min-w-0`, `post` + `postMemory`, drop `communityMemory`, seam, Markdown module, text-only create, Feed, detail, author display | none       |
| 30  | Edit and remove: statements, Feed policy, menu, Dialog, `editedAt`                                                                                              | 29         |
| 31  | Likes: toggle, counts, who liked                                                                                                                                | 29         |
| 32  | Comments: composer, list, removal                                                                                                                               | 30         |
| 33  | Share link: share action, org lookup read, auto-switch, one `NotFound`                                                                                          | 29         |
| 34  | Gallery images: `postMemoryMedia`, upload in Drawer, discard rules, mosaic, lightbox, reorder, `memory` owner check                                             | 25, 30     |
| 35  | Video: atom module both sides, poster, `206`, tile, playback, failure, download                                                                                 | 34         |
| 36  | Storage used on settings overview                                                                                                                               | 23         |

Storage (22 to 28) and Feed (29 to 33) are independent until 34, so they can run side by side. They
do both add migrations and touch `constants.ts`, `limits.ts` and `permission.ts`, so expect small
merge conflicts. Human steps: create the bucket with
`wrangler r2 bucket create kutumb-blobs --location apac` before 22 deploys, and confirm
`communityMemory` is empty on prod before 29 deploys.
