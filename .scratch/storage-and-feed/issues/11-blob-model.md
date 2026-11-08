# Blob model

Type: grilling Status: resolved Blocked by: 01, 02

## Question

What is a blob in our domain? Decide the record and its lifecycle (pending, attached, deleted), key
layout in R2, how a blob ties to its owning record and org, how orphans from abandoned uploads get
cleaned, and how deletion cascades when a profile, Post or whole org goes. One bucket or several,
and how dev and prod stay separate?

A blob's owner can be a Change Request, not only a profile or Post: a proposed Profile Photo is
visible to submitter and owner/admin only, and its bytes are deleted when the request closes without
applying. Bytes never outlive their owner for audit: see ADR 0009.

Gallery blobs belong to a Memory, not to Post; SQL cascades can't reach R2, so this ticket owns byte
cleanup when a Post goes: see [Feed model](07-feed-model.md).

Bytes go when media is removed in a Memory edit and when a Memory is removed: both are immediate
hard deletes with no undo. A Memory has no drafts, so closing the create Drawer abandons any media
already uploaded, leaving orphans to clean: see [Memory lifecycle](08-memory-lifecycle.md).

Does the read gate check membership of the blob's owning org, or the active org? A tab left open
after an auto-switch still shows the old org: see
[Share link when another org is active](10-share-link-across-orgs.md).

## Answer

What a Blob is:

- One piece of media, one record. Variants (`avatar`, `thumb`, `display`, video `poster`) are objects
  under it. Immutable: a new crop is a new Blob. No dedupe. No original kept: re-crop is re-upload.
- Internal term, no glossary entry unless members see the word.

Owner:

- Both directions. Owning record says what's current (`communityProfile.photoBlobId`, Memory gallery
  row, `photo` Change Request payload). Blob holds `ownerKind` (`profile | memory | changeRequest`)
  plus `ownerId`, no FK, for gate and cleanup.
- No org FK on Blob: org delete must not take the rows that locate the bytes.
- Attach only inside the owner's server function, in its batch. Requires: `pending`, Actor's active
  org, uploaded by that Actor, media type fits the slot, all required variants landed (`variants`
  column). Attaches once. Only exception: approving a `photo` Change Request moves the owner fields,
  no byte copy.

Lifecycle `pending → attached → deleted`:

- Delete: the owning change marks Blobs `deleted` in its `db.batch`, then `waitUntil` deletes bytes;
  the row goes once R2 confirms. D1 first, so a live record never lacks bytes. Audit Events keep
  their metadata copy (ADR 0009). Profile deletes all pass through `planDelete`.
- Pending expires after 24h. Closing the Drawer sends a best-effort discard. Media removed in a
  Memory edit is marked on save, not on click. Media added in a cancelled edit stays pending.
- Multipart: only `uploadId` on the row. Client keeps the part list and sends it at completion; R2
  validates etags.

Sweep:

- Hourly, capped per run: expire pending, apply the rule, retry byte deletes.
- One rule: an `attached` Blob whose owner row is gone is `deleted`. Each owner kind supplies its
  own check. Covers org delete with no hook, and any future path that forgets to mark, such as
  account deletion cascading a linked profile.
- Custom `src/server.ts` exports `fetch` and `scheduled`, set as `main`.

R2:

- Key `<orgId>/<blobId>/<variant>`, stable from upload to delete. No pending prefix: the binding has
  no `copy()`. Overrides the prefix idea in the serving research.
- One private bucket `kutumb-blobs`, location hint `apac`, lifecycle `--abort-multipart-days 1`.
  Local Uploads off until a real upload test needs it.
- `vite dev` uses Miniflare local R2, `remote: true` never set. Separate bucket only for the
  throwaway deploy in [Real device and plan checks](17-real-device-and-plan-checks.md).

Gate:

- Checks membership of the Blob's owning org, never the active org. Non-member, wrong org and missing
  Blob get one identical 404.
- Pending is never served, even to its uploader: the browser previews the local file.
- Memo's restricted set: `pending`, `deleted`, Change Request owned, photos on `inactive` or `draft`
  profiles.
- Accepted: 30s memo lag, 1-day browser `max-age` for removed members.
- Revalidation does an R2 `head()`, 404 if gone. Overrides "304 without R2" in the serving research:
  once the row is gone a member would get `304` forever, breaking ADR 0009.

## Comments

Multipart overridden: every file is one `put()`, see
[Upload limits and storage quotas](12-upload-limits-and-quotas.md).

Throwaway deploy dropped, so no separate bucket. See
[Real device and plan checks](17-real-device-and-plan-checks.md).

Blob gains Worker-read `width`, `height` and `durationMs`. See
[Video playback in the Feed](19-video-playback-in-the-feed.md).

Media added in a cancelled edit is now discarded on close, not left pending. A `pending` file removed
in the Drawer is discarded on click. Upload route re-checks the row after `put()`. See
[Cancelled Memory edit](20-cancelled-memory-edit.md).
