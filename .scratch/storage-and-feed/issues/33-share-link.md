# Share link

Status: ready-for-agent Blocked by: 29

## What to build

- Share action: native sheet on touch, else copy with a toast.
- One small read with `authMiddleware`, not `orgMiddleware`: finds the Post's org, checks membership
  itself. Returns found, other org, or not found.
- Loader only reports "other org". The page component switches with the existing `setActive` flow
  and stays on the Post, with a toast naming the community.
- Page `head` stays generic.

## Spec

[spec.md](../spec.md): Feed > Share link.

## Done when

- [ ] Member of two orgs opens a link for the inactive one: switches, stays on the Post, toast.
- [ ] Hovering a link to such a Post doesn't switch org: `defaultPreload: "intent"`.
- [ ] Non-member, ex-member, invitee, removed Post and unknown id get the same server response.
- [ ] Signed out: login, then back to the Post.
- [ ] No Post title in page `head`.
