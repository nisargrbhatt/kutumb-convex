# Gate memo and sweep

Status: ready-for-agent Blocked by: 24

## What to build

Make the read gate cheap and clean up what nothing else does.

- Isolate memo in the `GET` route, about 30 s, plain data only: session hash to user and roles, org
  to restricted blob ids. Unrestricted plus member reads no D1. `PUT` stays live.
- `scheduled`: expire `pending`, apply the owner-gone rule, retry byte deletes, at most 40
  subrequests, bulk `delete(keys)`.
- Owner checks as `Record<ownerKind, …>`. `profile` is real. `changeRequest` and `memory` are stubs
  reporting "exists", safe because nothing attaches to them yet: [`photo` Change
  Request](27-photo-change-request.md) and [Gallery images](34-gallery-images.md) replace them.

## Spec

[spec.md](../spec.md): Blobs > Sweep, Serving > Gate.

## Done when

- [ ] A member's second `GET` inside the TTL makes no D1 query, shown by a test with a counting
  fake.
- [ ] A restricted Blob still gets the full check on a memo hit.
- [ ] An `attached` Blob whose profile is gone becomes `deleted`, then its bytes and row go.
- [ ] Expired `pending` rows are swept. A run stops at the subrequest budget and the rest wait for
  the next.
- [ ] Nothing else depends on the cron: pending cap still ignores expired rows with the sweep off.
