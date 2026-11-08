# Gallery images

Status: ready-for-agent Blocked by: 25, 30

## What to build

Photos on Memories, from Drawer to lightbox.

- `postMemoryMedia`; `load` returns gallery with Blob size data.
- Drawer gallery grid: per-file progress and inline error, reorder arrows, a rejected file blocks
  posting, submit waits for uploads.
- `memoryImage` variants `thumb` and `display`, through the pipeline from [Profile Photo for the
  linked user](24-profile-photo-linked-user.md).
- `createMemory` and `updateMemory` attach Blobs in their batch. Edit marks removed `attached` media
  on save. Remove marks every Blob `deleted`.
- Discard rules: `FormDrawer` close without a save aborts uploads and discards; removing a `pending`
  file discards on click. A save's own close must not discard; the route ignoring non-`pending`
  makes a slip harmless.
- Mosaic for 1 to 5, ratio from Blob `width` and `height`. Lightbox with swipe, counter, and
  previous, next and close at every width. Generated media labels.
- Replace the `memory` stub owner check from [Gate memo and sweep](25-gate-memo-and-sweep.md).
- Check `src/routes/(public)/privacy-policy` still reads true.

## Spec

[spec.md](../spec.md): Blobs > Lifecycle, Feed UI (Card, Lightbox, Drawer), Unconfirmed defaults.

## Done when

- [ ] Create with 0 and with 5 images; 6 is refused by Drawer and server.
- [ ] Attach refuses another user's Blob, another org's, an unfinished one, and one already
  attached.
- [ ] Cancel during an upload leaves no `pending` row and no bytes.
- [ ] Cancel on an edit restores attached media and discards new media.
- [ ] Removing a Memory deletes all its bytes. Sweep catches a Memory lost to org delete.
- [ ] Mosaic holds its layouts from 1 to 5 at phone, tablet, desktop, ultrawide.
- [ ] Image load error shows a placeholder.
