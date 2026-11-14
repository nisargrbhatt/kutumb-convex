# Userless Profile photos and moderation

Status: resolved Blocked by: 24

## What to build

Everyone else who may change a photo directly, and bytes following the profile out.

- Userless Profile: owner/admin and draft creators, on the existing direct path in `profileChanges`
  (`isReviewer`).
- `communityProfile: ["removePhoto"]`, owner and admin, in `src/domain/permission.ts` and
  `permission.test.ts`. Remove on a linked profile with a confirm Dialog, no reason.
- `planDelete` marks the Blob `deleted`; `profile.deleted` snapshot carries photo metadata.
- Reassign keeps the photo.

## Spec

[spec.md](../spec.md): Profile Photo (Who, Through the change seam).

## Done when

- [ ] Owner/admin set, replace and remove on a Userless Profile; a draft creator does on their
      draft.
- [ ] Owner/admin can remove but not set a linked profile's photo. Plain member can do neither.
- [ ] Every profile delete path takes the bytes, including a rejected draft.
- [ ] Reassigning a profile keeps `photoBlobId`.
- [ ] A plain member on an `active` Userless Profile sees no direct action:
      [`photo` Change Request](27-photo-change-request.md) gives them the request.

## Comments

Merged 0e621bc on feat/storage-integration.
