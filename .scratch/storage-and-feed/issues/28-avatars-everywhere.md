# Avatars everywhere

Status: resolved Blocked by: 24

## What to build

The photo shows wherever a Community Profile's avatar appears.

- Every read feeding `ProfileAvatar` selects `photoBlobId`. Lists use `avatar`.
- `GraphProfile` carries `photoBlobId`. Tree mounts `<img>` at zoom 0.5 and above, initials below,
  for the raw `Avatar` in `community-tree/index.tsx` and its `ProfileAvatar`.
- `AuthUser` sidebar: active org's linked profile photo, else `user.image`.
- MCP output stays photo-free: `get_profile`, `get_family_graph`, `search_profiles`.

## Spec

[spec.md](../spec.md): Profile Photo > Where it shows, Profile Photo > Who (AI Clients).

## Done when

- [ ] Members list, profile pages and Reviews show photos, with initials on image error.
- [ ] Tree zoomed out requests no images; zooming in does. Local dev.
- [ ] A photo change shows in the tree at once: `orgDataVersion` bumped.
- [ ] Switching org changes the sidebar photo.
- [ ] MCP tests assert no `photoBlobId` in any output.

## Comments

Merged 15c711a on feat/storage-integration.
