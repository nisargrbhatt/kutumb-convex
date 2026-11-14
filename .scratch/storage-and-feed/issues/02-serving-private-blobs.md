# Serving private blobs

Type: research Status: resolved Blocked by:

## Question

How should private blobs reach an authorized viewer? Compare a Worker-gated read route (session +
org check per request) with short-lived signed URLs.

Cover: Cache API and browser caching for private content, HTTP range requests for video, R2
operation and Worker request cost for a Feed page of 10 Posts with up to 5 media each, and
avatar-heavy pages such as the community tree. Say what access a leaked URL gives on each option,
and how thumbnails or sized variants could work without Cloudflare Images.

## Answer

Worker-gated route with stable URLs, not presigned URLs: a leaked gated URL gives a stranger
nothing, a presigned one is a bearer link for up to 7 days. Cost doesn't decide it. The real limit
is D1: about 3000 queries (estimate) for 1000 avatars, so the gate needs a ~30s isolate memo and the
tree loads avatars only above a zoom threshold. `private` browser caching with 304s, no Cache API in
v1, Workers Cache off (a hit skips the gate). Hand-built `206` for video. Variants generated in the
browser at upload; Cloudflare Images not needed.

Needs Workers Paid. Unverified: `<video>` with HttpOnly cookie on real iPhone, D1 load for a cold
1000-node tree, CPU per blob request through the TanStack route. For the Blob model ticket: is a 30s
lag on hiding a photo OK, and a 1-day browser `max-age` for removed members?

Findings: `.scratch/storage-and-feed/research/serving-private-blobs.md` on branch
`research/serving-private-blobs`.

## Comments

"Needs Workers Paid" dropped: design to Free limits, route ahead of TanStack in `src/server.ts`. See
[Real device and plan checks](17-real-device-and-plan-checks.md).
