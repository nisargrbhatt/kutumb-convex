# Feed permission statements

Type: grilling Status: resolved Blocked by: 08, 09

## Question

How do Feed rules map onto `statement` in `src/domain/permission.ts`? Owner/admin remove anyone's
Post or comment; any Org Member posts, likes and comments; authors edit and remove their own. Is
there a new statement such as `post: ["moderate"]`, does any Org Member right need a statement at
all, and do author checks stay outside access control, in the Feed module?

## Answer

Statements in `src/domain/permission.ts`:

- `post: ["moderate"]`, owner and admin only: remove anyone's Post or Comment. No `comment` resource.
  No role hierarchy, so an admin may remove an owner's Post. A later power such as pinning gets its
  own action.
- `communityProfile: ["removePhoto"]`, owner and admin only: remove the photo of a linked profile,
  per [Who can change a Profile Photo](06-who-can-change-a-profile-photo.md). Userless Profile photo
  changes stay on the `isReviewer` direct path.
- `permission.test.ts` tables gain both.

Any Org Member rights:

- No statement for posting, liking, commenting or uploading. `orgMiddleware` membership is the only
  gate. `communityProfile: ["create"]` and `changeRequest: ["create"]` are held by every role, so
  those checks can't fail; not copied.
- A future restricted kind of Post adds its own action then.

Author checks:

- Outside access control, in a pure, client-safe Feed policy used by server and UI:
  - `canEditPost`: author only.
  - `canRemovePost`: author, or `post: ["moderate"]`.
  - `canRemoveComment`: same rule. Post author gets no extra right.
- Compare `actor.userId` with `authorUserId`. No ex-member logic: a non-member has no Actor, and
  rejoining with the same user id restores rights.
- UI calls the same functions with `useActor`. The share link has no stale-role window: the loader
  returns only "other org" until the switch.

Org scoping:

- `can()` looks at role only, so an admin of org A would pass for a Post in org B. Every Feed write
  loads by id + `actor.organizationId`, so another org's Post or Comment is `NotFound` before the
  policy runs.

Code checks go through `can`/`assertCan`, not `auth.api.hasPermission`: nothing calls the latter, so
`CLAUDE.md` is stale on this.
