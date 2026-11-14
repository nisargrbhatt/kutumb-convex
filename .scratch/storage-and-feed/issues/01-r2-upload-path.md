# Upload path to R2

Type: research Status: resolved Blocked by:

## Question

How should a browser get a file into a private R2 bucket from this app (TanStack Start on Cloudflare
Workers)? Compare direct presigned PUT (S3 API) with streaming through the Worker via the R2
binding.

Cover: Worker request body limits by plan, memory and CPU limits, credentials a presigned URL needs,
how size and content type can be enforced on each path, CORS, multipart for larger videos, abandoned
uploads, and local dev with `@cloudflare/vite-plugin` and wrangler.

## Answer

Stream uploads through the Worker via the R2 binding, on a server route, not `createServerFn` (it
reads the whole body first). Small files: one `put()`. Large video: Worker multipart, ~8 MiB parts,
state in D1. Presigned PUT is the fallback: no POST policy, size enforcement undocumented, needs S3
secret, CORS and a real dev bucket. Cleanup: lifecycle `--abort-multipart-days 1` plus a D1 pending
sweep, which needs a `scheduled` handler in a custom server entry.

Assumes Free/Pro zone (100 MB body cap) and Workers Paid: to confirm. Test on real R2: parallel
parts vs 1 write/s per key, CPU per part, 413 on the deployed domain.

Findings: `.scratch/storage-and-feed/research/r2-upload-path.md` on branch
`research/r2-upload-path`.

## Comments

Multipart overridden: every file is one `put()`, see
[Upload limits and storage quotas](12-upload-limits-and-quotas.md).
