# Cancelled Memory edit

Type: grilling Status: resolved Blocked by:

## Question

Media added in a cancelled Memory edit stays `pending`, so at the 500 MB pending cap a retry can
wait up to 24h. Should cancelling an edit send the same best-effort discard as closing the create
Drawer, for media added in that edit only? See [Blob model](11-blob-model.md) and
[Upload limits and storage quotas](12-upload-limits-and-quotas.md).

## Answer

Yes. One discard route and one rule for create and edit.

- **Scope.** The browser keeps the ids of Blobs uploaded since the Drawer opened and sends only
  those. The route acts only on `pending` Blobs uploaded by that Actor, so a stale or repeated call
  can't touch attached media, even if a save landed and its response was lost.
- **Effect.** A discarded Blob leaves the pending sum at once, so a retry isn't stuck behind the
  cap. A failed discard waits for the 24h expiry.
- **Trigger.** Any Drawer close without a save: Cancel, X, Esc, overlay. All go through
  `FormDrawer`'s `handleOpenChange`. No unsaved-changes guard. Tab close, refresh and crashes send
  nothing and fall to the 24h expiry. No `pagehide` beacon.
- **Removing in the Drawer.** A `pending` file is discarded on click, in create and edit. An
  `attached` file is still marked on save, because Cancel must restore it.
- **Upload running at close.** Close aborts running uploads, then discards. The upload route
  re-reads the row after `put()` and deletes the bytes if the Blob is no longer `pending`. Without
  this a late `put()` leaves bytes with no row, which the sweep can't find. Applies to create too.
