Label: wayfinder:map

# Storage and Feed

## Destination

A spec at `.scratch/storage-and-feed/spec.md` plus ADRs, ready to slice into implementation tickets
at `.scratch/storage-and-feed/issues/`, for: (a) private blob storage on Cloudflare R2, (b) Profile
Photos with crop, shown wherever a Community Profile's avatar appears, and (c) the Feed with Memory
as its first kind of Post. No feature code in this map; throwaway prototypes are fine.

## Notes

- Domain: `GLOSSARY.md` terms **Profile Photo**, **Feed**, **Post**, **Memory**, **Org Member**,
  **Community Profile**, **Userless Profile**, **Change Request**, **Audit Event**, **Actor**.
  Limits per ADR 0003; audit snapshots per ADR 0005.
- Skills to consult: `grilling` + `domain-modeling` (default), `codebase-design`,
  `workers-best-practices`, `wrangler`, `tanstack-start-best-practices`,
  `tanstack-query-best-practices`, `better-auth-security-best-practices`.
- Source brief: `TODO.md`.
- Standing decisions from charting:
  - One effort: the blob layer serves both Profile Photos and galleries.
  - Only Memory is specified. A new kind of Post must fit without migrating existing Posts, but
    announcements and polls get no behaviour here.
  - Authors, likers and commenters are Org Members when they act, shown through their linked
    Community Profile where the viewer can see one, else user name and initials. Userless Profiles
    never post.
  - Profile Photo belongs to the Community Profile, per org. The sidebar shows it for the active org
    when one exists. `user.image` stays as is.
  - Every blob is private to its org: no public URLs. A blob is readable only by an Actor who can
    see the owning record, so a Profile Photo follows profile visibility (`inactive` stays hidden).
  - Share link is a plain deep link: it can be passed around, but opening it needs sign-in as an Org
    Member of that org. No public, guest or cross-org view.
  - R2 + Workers only. Paid add-ons (Cloudflare Images, Stream) are proposed only if something can't
    be done without them.
  - Uploading straight from an iPhone camera roll must work, including HEIC photos and HEVC `.mov`
    videos, with no manual converting. A clip over the size limit is still rejected. A HEIC file on
    a browser that can't decode it is rejected: the member exports it as JPEG.
  - Memory description is formatted text only (bold, italic, lists, links, headings). All media
    lives in the gallery, nothing inline.
  - The `/memories` → `/feed` route move and nav update go straight into the spec: no ticket.
  - No real-device or deploy checks will happen. Prefer restricting a feature over depending on
    anything unverified. Design to Workers Free limits.
- Existing code:
  - `ProfileAvatar` (`src/components/profile/ProfileName.tsx`) renders initials only.
    `community-tree` also has a raw `Avatar` with initials.
  - `AuthUser` reads `session.user.image`; no other image column exists.
  - `src/routes/_authed/_community/memories/index.tsx` is a stub. Nav entry in
    `src/components/CommunityLayout/CommunityNav.tsx`. Public pages mention memories too.
  - No R2 binding in `wrangler.jsonc`; no rich text or crop dependency.
  - Change Request kinds and audit actions live in `src/db/constants.ts`.

## Decisions so far

<!-- the index: one line per closed ticket, enough to judge relevance, then zoom the link for the detail the ticket holds -->

- [Upload path to R2](issues/01-r2-upload-path.md): stream through the Worker via R2 binding;
  presigned PUT is the fallback. Multipart since dropped by the limits ticket.
- [Server-side blob verification in Workers](issues/03-server-side-blob-verification.md): browser
  converts photos to JPEG, Worker checks headers and strips metadata; video kept as uploaded, GPS
  atoms renamed.
- [Serving private blobs](issues/02-serving-private-blobs.md): Worker-gated route with stable URLs,
  memoized gate, `private` browser caching; variants made in the browser at upload.
- [Crop library options](issues/04-crop-library-options.md): `react-easy-crop`, normalize with
  `createImageBitmap`, export JPEG; no HEIC decoder, see HEIC ticket below.
- [Rich text editor options](issues/05-rich-text-editor-options.md): Tiptap 3 stored as JSON, gated
  on a device smoke test. Superseded by Memory description format.
- [Who can change a Profile Photo](issues/06-who-can-change-a-profile-photo.md): linked user direct,
  owner/admin remove only; new `photo` Change Request on Userless Profiles; audit keeps metadata,
  bytes deleted (ADR 0009).
- [Feed model](issues/07-feed-model.md): base `post` plus a table per kind (ADR 0010), likes and
  comments on Post, gallery on Memory, audit-style cursor, `/feed/$postId`, one `load` per kind.
- [Memory lifecycle](issues/08-memory-lifecycle.md): any Org Member posts live, no drafts; author
  edits; author or owner/admin hard-delete, no trail; content outlives the author via name snapshot.
- [Likes and comments rules](issues/09-likes-and-comments-rules.md): flat plain-text comments, no
  edit, newest first on detail page; one like per member with visible likers; counts computed at
  read.
- [Share link when another org is active](issues/10-share-link-across-orgs.md): plain
  `/feed/$postId`, server finds org from Post; member auto-switches with toast, after mount;
  everyone else gets one identical not-found.
- [Blob model](issues/11-blob-model.md): one immutable record per media, variants under it; mark
  `deleted` in D1 then delete bytes, hourly sweep covers org delete; gate checks owning org.
- [Upload limits and storage quotas](issues/12-upload-limits-and-quotas.md): video 2 min and 100 MB,
  one `put()` per file, no multipart; no storage cap (ADR 0011), 500 MB pending cap per member.
- [Profile Photo crop editor](issues/14-profile-photo-crop-editor.md): wide Drawer, square crop,
  zoom, straighten and 90° rotate, live previews; `display` capped at 1024 px, never upscaled.
- [Feed card, gallery and detail page](issues/15-feed-card-gallery-detail.md): Stream layout, one
  centred column, mosaic of 1 to 5 media, lightbox, single-column detail; `main` needs `min-w-0`.
- [Real device and plan checks](issues/17-real-device-and-plan-checks.md): not run, no phones or
  deploy; Free zone, plan unknown, so design to Free. Worker verifies, never rewrites; video 95 MB.
- [Memory description format](issues/13-memory-description-format.md): textarea + Markdown, not
  Tiptap; Worker parses once at save into source, tree and 300-char text (ADR 0012); 5,000 chars.
- [HEIC on browsers that can't read it](issues/16-heic-on-browsers-that-cant-read-it.md): rejected
  with its own message, no `heic-to`, no paid fallback; HEVC stays accepted, poster plus download.
- [Feed permission statements](issues/18-feed-permission-statements.md): `post: ["moderate"]` and
  `communityProfile: ["removePhoto"]` for owner/admin; membership gates the rest; author checks in a
  pure Feed policy; writes load by org.
- [Video playback in the Feed](issues/19-video-playback-in-the-feed.md): lightbox only, no autoplay,
  nothing downloads before play; failure on `error` or zero `videoWidth`; Blob gains Worker-read
  size and duration.
- [Cancelled Memory edit](issues/20-cancelled-memory-edit.md): any Drawer close discards media added
  in that session, `pending` removal discards on click; upload route re-checks the row after
  `put()`.
- [Write the spec](issues/21-write-the-spec.md): [spec.md](spec.md) done; browser must strip
  WebKit's APP1/APP13 JPEG blocks. Sliced into 15 implementation tickets, `issues/22` to
  `issues/36`.

## Not yet specified

## Out of scope

- Notifications and email on like or comment.
- MCP/AI Client access to the Feed.
- Profile Photo via MCP: tools take text, so uploads don't fit; no photo in `get_profile`.
- Video transcoding.
- Content reporting flows.
- Search over the Feed.
- Behaviour of announcements, polls or any kind of Post other than Memory.
- Public, guest or cross-org viewing.
