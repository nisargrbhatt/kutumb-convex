# Memory edit and remove

Status: ready-for-agent Blocked by: 29

## What to build

Authors edit; authors and owner/admin remove.

- `post: ["moderate"]` in `permission.ts` and `permission.test.ts`, owner and admin.
- Pure Feed policy: `canEditPost`, `canRemovePost`, `canRemoveComment`. Server and UI share it.
- `updateMemory`: re-parses the description, sets `editedAt`, loads by id + `actor.organizationId`.
- Remove: confirm Dialog, hard delete, no Audit Event.
- Actions menu, "· edited" marker, edit Drawer loading `description`.
- Update `CLAUDE.md`: checks use `can` / `assertCan`, not `auth.api.hasPermission`.

## Spec

[spec.md](../spec.md): Feed (Memory lifecycle, Permissions), Feed UI (Card).

## Done when

- [ ] Policy table test: author, other member, admin, owner, ex-member.
- [ ] Admin of org A acting on org B's Post gets `NotFound` before the policy runs.
- [ ] Owner/admin can't edit someone else's Memory; can remove it. An admin can remove an owner's
  Post.
- [ ] Removing a Post leaves no rows behind, by FK cascade.
- [ ] Menu is absent when there's nothing to show.
