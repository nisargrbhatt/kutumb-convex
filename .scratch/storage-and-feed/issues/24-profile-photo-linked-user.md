# Profile Photo for the linked user

Status: resolved Blocked by: 23

## What to build

First thing a member can see: on their own profile, add, replace and remove a photo with the crop
editor, and see it on the profile header.

- `communityProfile.photoBlobId`, migration.
- `makeProfileChanges` plans for set, replace, remove: `version` and `orgDataVersion` bump in the
  batch, `profile.photo_changed` Audit Event, old Blob marked `deleted`, bytes deleted after.
- Audit Log renders the new action with metadata only.
- `react-easy-crop` editor in a wide Drawer, per the prototype on `prototype/profile-photo-crop`.
- Browser photo pipeline: 50 MiB check, `createImageBitmap` capped at 2048 px, canvas export, check
  `blob.type`, strip, `avatar` and `display`, two HEIC and unreadable messages.
- `ProfileAvatar` takes `photoBlobId`. Profile header uses `display`, with initials on error.

## Spec

[spec.md](../spec.md): Upload > Photos in the browser, Profile Photo (Who: linked rows, Through the
change seam, Crop editor), Unconfirmed defaults.

## Done when

- [ ] Linked user sets, replaces and removes their photo on `/profile/info`, on desktop and mobile
  emulation widths.
- [ ] Straighten at low zoom leaves no white wedges: minimum zoom rises with the angle.
- [ ] `display` is capped at 1024 px and never upscaled.
- [ ] Saved files hold no APPn but APP0. Checked in Chrome here; the strip path is unit tested with
  the WebKit fixture.
- [ ] Replacing a photo deletes the old bytes. Audit Event holds metadata, no bytes.
- [ ] A HEIC file on Chrome shows the HEIC message, not a crash.
- [ ] Plan tests in the existing `profileChanges` harness.

## Comments

Merged 387cdcb on feat/storage-integration.
