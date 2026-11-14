# Profile Photo crop editor

Type: prototype Status: resolved Blocked by: 04

## Question

How should selecting and cropping a Profile Photo look and behave across phone and desktop, inside
the right-side Drawer pattern? Is the crop region square or circular, what zoom and rotate controls
exist, and what is the output size?

Output is `avatar` at 128 px plus `display` at most 1024 px: see
[Upload limits and storage quotas](12-upload-limits-and-quotas.md).

## Answer

Variant C, the workspace, chosen by the owner.

- Wide right-side Drawer (`lg`): crop stage left, "Where it shows" previews right. Stacks on phone
  with stage and controls first, previews scrolled below, footer sticky.
- Opened from an "Add photo" or "Edit photo" button on the profile header. Remove is a separate icon
  button with the confirm Dialog.
- Square crop with thirds grid. Output is a square JPEG; circles are only how avatars render.
- Controls: Zoom and Straighten tabs. Zoom 1x to 4x, straighten -45° to 45°, plus 90° left and
  right. "Choose another" in the footer.
- Live previews at real sizes: list row, profile header, community tree, square full view. Drawn
  from a 512 px copy so dragging stays cheap.
- Output: `avatar` 128 px, `display` the crop's edge capped at 1024 px, never upscaled.

Required fix, found in the prototype: straighten at low zoom leaves white wedges in the saved photo.
Minimum zoom must rise with the angle so the crop stays inside the photo.

Defaults not confirmed by the owner, change if wrong:

- Profile header uses `display`: it's 80 px wide, so 128 px is soft on a 2x screen. Lists use
  `avatar`.
- A `photo` Change Request uses the same editor, with the button reading "Send for review".

Not checked: real touch, and the editor on the signed-in `/profile/info` page. Real touch is on
[Real device and plan checks](17-real-device-and-plan-checks.md). KB sizes came from a synthetic
sample, so they say nothing about real photos.

Prototype: commit `8be8d3d` on local branch `prototype/profile-photo-crop`, all three variants.
