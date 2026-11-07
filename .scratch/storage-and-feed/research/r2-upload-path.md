# Research: upload path to R2

Ticket: `.scratch/storage-and-feed/issues/01-r2-upload-path.md`. Researched 2026-11-07.

Evidence labels: bracket tags cite Sources. **Measured** = run locally on this repo's versions.
**Third-party** = not Cloudflare, not confirmed by its docs. **Inference** = my reasoning. No real
R2 bucket was touched.

## TL;DR

- **Recommend streaming through the Worker via the R2 binding**, for every file. One `put()` for
  small files, Worker-mediated multipart for large video. Full reasoning in Recommendation.
- The 100 MB body cap (Free/Pro zones) rules out a single request for phone video, not the Worker
  path. Parts of ~8 MiB fit easily.
- Presigned PUT keeps bytes off the Worker, and Cloudflare's reference architecture prefers it. But
  R2 has no POST policy, so the size cap rests on undocumented behaviour. It also adds an S3 secret,
  bucket CORS, and a dev story Miniflare cannot simulate.
- No paid add-on is needed on either path. Workers Paid is assumed (see Open questions).

## What the files need

| File          | Size                                                  | Fits one Worker request (100 MB)? |
| ------------- | ----------------------------------------------------- | --------------------------------- |
| Profile Photo | Small, cropped                                        | Yes                               |
| Memory image  | A few MB (HEIC/JPEG)                                  | Yes                               |
| Memory video  | 2 min ≈ 340 MB at 4K30 HEVC, ≈ 800 MB at 4K60 [imore] | **No**                            |

Video figures are third-party estimates: ~170 and ~400 MB/min. Ticket 12 owns the real cap.

## Comparison

| Topic                 | Worker + binding                                                                         | Presigned PUT                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Max per request       | Zone plan: Free/Pro 100 MB, Business 200 MB, Enterprise up to 5 GB; else 413 [wk-limits] | 5 GiB single PUT [r2-limits]                                                                   |
| Memory                | 128 MB per isolate, shared by concurrent requests; fine only if streamed [wk-limits]     | None used                                                                                      |
| CPU                   | Free 10 ms, Paid 30 s default, 5 min max. I/O waits not counted [wk-limits]              | Signing only; no call to R2 [presign]                                                          |
| Credentials           | Binding only                                                                             | Account ID + R2 token (Access Key ID, Secret) as Worker secrets; `aws4fetch` to sign [presign] |
| Auth                  | Session checked on every request                                                         | Checked once at signing. URL is a reusable bearer token until expiry [presign]                 |
| Size                  | Hard: check `Content-Length` before writing, then `R2Object.size`                        | No policy. Signed `Content-Length` undocumented (below). Else check after upload               |
| Content type          | Worker sets it from an allow-list                                                        | Declared value pinned by signature; 403 on mismatch [presign]                                  |
| Real bytes            | Not checked by either; ticket 03                                                         | Same                                                                                           |
| CORS                  | None (same origin)                                                                       | Required; always cross-origin                                                                  |
| Upload-done signal    | Worker sees it, in the same request                                                      | Client must report it, or event notification + Queue                                           |
| Local dev             | Works with no account (**measured**)                                                     | No local S3 endpoint; needs a real bucket                                                      |
| Extra cost            | One Worker request per file or part [wk-pricing]                                         | One Worker request per signing call                                                            |
| Cloudflare's guidance | Used for server-generated content [ugc]                                                  | Recommended for user uploads; "avoids routing large files through" the Worker [ugc]            |

R2 operations cost the same on both paths: `PutObject`, `UploadPart` and multipart create/complete
are Class A, $4.50/million; abort and delete are free [r2-pricing].

## Worker limits

- Body limit depends on the **zone's Cloudflare plan, not the Workers plan** [wk-limits]. Raising it
  is self-serve only on Enterprise. Plan on 100 MB.
- No duration limit on HTTP Workers while the client stays connected. Runtime updates give in-flight
  requests up to 20 minutes [wk-limits]. Short part requests sit well inside that.
- Docs put typical auth-handling Workers at 10-20 ms CPU [wk-limits], so the Free plan's 10 ms is
  tight. They do not quantify CPU for a body passed to `put()`, so measure it.
- `put()` and `uploadPart()` accept `request.body` only with a known length. Chunked bodies and
  `TransformStream` output throw `TypeError`, unless piped through `FixedLengthStream` [r2-binding].
  Pass the body straight through.
- **Do not send bytes through `createServerFn`.** It calls `await request.formData()` before the
  handler (`@tanstack/start-server-core/src/server-functions-handler.ts:98`), so the whole body is
  read first. Use a server route with `server.handlers`, as in `src/routes/api/ph/$.ts`. The browser
  sends the raw `Blob`, not `FormData`, or boundaries end up in the object (inference).

## Presigned details

- The binding cannot sign. Use `aws4fetch` or the AWS SDK with `nodejs_compat` [presign]. Expiry is
  1 second to 7 days.
- Token: **Object Read & Write**, scoped to the one bucket [tokens]. Temporary credentials can
  narrow to prefixes [temp], but the docs do not say they can sign presigned URLs.
- `POST` form uploads are not supported [presign], so S3's `content-length-range` is unavailable.
  The page says nothing on Content-Length, and nothing in `r2/llms-full.txt` ties a signed length to
  size enforcement.
- **Signed `Content-Length`:** third-party tests show R2 enforcing it. A URL signed for 1024 bytes
  gave 200 for exactly 1024 and 403 for 1023, 1025 and 2048, with nothing stored [icarus]. A
  900-byte body on a 1000-byte URL gave 403 [xiaolee]. This is the best available size control, but
  Cloudflare does not promise it. The server caps the declared size, then signs that exact length.
- `aws4fetch` 1.0.20 skips `content-type` and `content-length` unless `allHeaders: true` (source:
  `UNSIGNABLE_HEADERS`). Signing a length inside workerd was not tested.
- Signed length must equal the final bytes. Sign after any crop or recompress step, or uploads 403
  [xiaolee].
- URL is reusable, so a client could overwrite an already verified object until expiry. Keep expiry
  short. R2 lists `If-None-Match` on `PutObject` [s3-api]; signing `If-None-Match: *` should block
  overwrites (inference, untested).

## CORS (presigned only)

- URLs work only on `<ACCOUNT_ID>.r2.cloudflarestorage.com`, never a custom domain [presign], so the
  browser is always cross-origin. A cross-origin `PUT` always preflights [fetch].
- A valid URL still fails without a matching bucket policy [r2-cors]. Allow `PUT`, the app origin,
  `http://localhost:3000`, and `Content-Type`. Multipart must expose `ETag` so the client can read
  part ETags [r2-cors].
- Origin patterns allow one `*`; ports cannot be wildcarded [r2-cors]. `https://*.trycloudflare.com`
  would cover the tunnel hosts allowed in `vite.config.ts`.
- Expired-URL 403s carry no CORS headers, so JS cannot read the error [r2-cors]. Treat an opaque
  failure as "fetch a new URL".
- Policy changes can take up to 30 seconds [r2-cors]. Apply with `wrangler r2 bucket cors set`.

## Multipart for video

Limits on both paths: 5 MiB minimum part (except last), 5 GiB maximum, 10,000 parts, all parts but
the last the same size [r2-mp]. Violations give `EntityTooSmall` / `InvalidPart` [r2-errors].

- **Why use it:** the 100 MB cap on the Worker path, and on both paths a dropped phone connection
  retries one part, not the file. Cloudflare's upload guide suggests single `PUT` under ~100 MB and
  multipart for resumability [r2-upload].
- **Worker path:** `createMultipartUpload` →
  `resumeMultipartUpload(key, uploadId).uploadPart(n, request.body)` → `complete(parts)`. Each part
  is its own invocation and stays under the body limit [r2-mp-worker]. `uploadId` and part ETags
  must live outside the Worker [r2-mp-worker]: D1 here.
- **Size on the Worker path:** initiate declares total size. Store `partSize` and `partCount`. Each
  part must have the exact expected `Content-Length`. So the total is bounded before anything
  completes.
- **Sizing:** 8 MiB parts make a 340 MB video 41 parts, 43 requests with create and complete, about
  $0.0002 of Class A.
- **Presigned path:** create and complete still run on the server, and each part needs its own
  signed URL. `UploadPart` is implemented [s3-api], but no Cloudflare page shows a presigned one.
- **Parallelism:** R2 limits writes to one key to 1/s, with 429 above that [r2-limits]. Docs do not
  say if this covers parts. Start at 2-3 parallel parts, retry on 429, test on real R2.
- **Distance:** Local Uploads writes near the client and copies to the bucket asynchronously, at no
  extra cost, for `PutObject` and `UploadPart`. Not for jurisdiction buckets [r2-local-uploads]. A
  one-command option if phones are far from the bucket.

## Abandoned uploads

Three cases, the same on both paths except where noted. Ticket 11 owns the blob lifecycle.

| Case                        | What happens                                                                     | Handling                                                               |
| --------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Single PUT dies midway      | `IncompleteBody` on the S3 API [r2-errors]; no object expected (inference)       | Client retries                                                         |
| Multipart never completed   | Auto-aborted after 7 days [r2-mp]. Docs imply parts count as storage [r2-upload] | Lifecycle `--abort-multipart-days 1` [wr-r2], plus `abort()` on cancel |
| Upload done, never attached | Object lives forever                                                             | D1 `pending` row + expiry sweep                                        |

- Lifecycle rules filter on prefix and age only [r2-lifecycle], so they cannot see "attached". An
  expire rule works only on a staging prefix, and leaving it needs a copy: docs show no binding
  `copy()`, only S3 `CopyObject` [s3-api]. Stable keys + D1 sweep look simpler.
- Lifecycle deletion lands within about 24 hours [r2-lifecycle], so it is a backstop, not a quota
  control.
- A sweep needs `scheduled`. The current `main` exports only `fetch` (default server entry source),
  so add a custom entrypoint [tss]. Queue consumers need the same.
- Presigned adds a fourth case: uploaded, client never reports back. Worker only learns via `head()`
  in the sweep, or `object-create` notifications [r2-events]. Those need a Queue (10,000
  operations/day on Free [q-pricing]) and that custom entrypoint.

## Local dev

Both `vite dev` and `wrangler dev` run Miniflare; state lands in `.wrangler/state` [local-data]. Add
`r2_buckets` to `wrangler.jsonc`, which the Vite plugin reads, then `npm run cf-typegen`.

**Measured** on `@cloudflare/vite-plugin` 1.40.0, wrangler 4.98.0, miniflare 4.20260603.0, with a
probe Worker using this repo's `compatibility_date`. Same result on both servers:

| Test                                | Result                                             |
| ----------------------------------- | -------------------------------------------------- |
| `put(request.body)`, Content-Length | 200; length and `contentType` correct              |
| `put(request.body)`, chunked        | 500, the documented `TypeError`                    |
| 150 MiB `put` in one request        | **200: the 100 MB limit is not simulated locally** |
| Multipart 6 MiB + 1 MiB via binding | 200; `head()` size 7,340,032                       |

- So the body cap never shows up in dev. Enforce the app's own limit in code, and test the 413 once
  on a deployed Worker.
- Miniflare's R2 is a binding simulator: no SigV4 or presign code in `miniflare/dist/src` (grep),
  and docs do not mention a local S3 API. So a presigned URL has nothing local to hit (inference).
- Presigned dev therefore needs a real dev bucket, its CORS policy, S3 keys in `.dev.vars`, and
  `remote: true` on the binding so the Worker sees what the browser uploaded. Remote bindings work
  with the Vite plugin; Secrets cannot be remote [dev]. Those operations hit real data and cost
  money [dev]. Third-party warning: a fake R2 that skips signature checks hid a 403 bug [xiaolee].

## Open questions

- Which Cloudflare plan is the `nisargbhatt.org` zone on? 100 MB assumed.
- Which Workers plan? Paid assumed. On Free, measure CPU per part vs 10 ms.
- One bucket location or Local Uploads? Depends on where members are; ticket 11.
- Real-R2 checks before ship: parallel parts vs 1 write/s, CPU per part, 413 on the deployed domain.
- Only if presigned is adopted: signed `Content-Length`, presigned `UploadPart`, `If-None-Match`.

## Sources

Fetched 2026-11-07.

Cloudflare:

- [wk-limits] https://developers.cloudflare.com/workers/platform/limits/
- [wk-pricing] https://developers.cloudflare.com/workers/platform/pricing/
- [presign] https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- [tokens] https://developers.cloudflare.com/r2/api/tokens/
- [temp] https://developers.cloudflare.com/r2/api/s3/temporary-credentials/
- [s3-api] https://developers.cloudflare.com/r2/api/s3/api/
- [r2-limits] https://developers.cloudflare.com/r2/platform/limits/
- [r2-errors] https://developers.cloudflare.com/r2/api/error-codes/
- [r2-pricing] https://developers.cloudflare.com/r2/pricing/
- [r2-binding] https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
- [r2-mp] https://developers.cloudflare.com/r2/objects/multipart-objects/
- [r2-mp-worker] https://developers.cloudflare.com/r2/api/workers/workers-multipart-usage/
- [r2-upload] https://developers.cloudflare.com/r2/objects/upload-objects/
- [r2-cors] https://developers.cloudflare.com/r2/buckets/cors/
- [r2-lifecycle] https://developers.cloudflare.com/r2/buckets/object-lifecycles/
- [r2-events] https://developers.cloudflare.com/r2/buckets/event-notifications/
- [r2-local-uploads] https://developers.cloudflare.com/r2/buckets/local-uploads/
- [q-pricing] https://developers.cloudflare.com/queues/platform/pricing/
- [ugc]
  https://developers.cloudflare.com/reference-architecture/diagrams/storage/storing-user-generated-content/
- [dev] https://developers.cloudflare.com/workers/development-testing/
- [local-data] https://developers.cloudflare.com/workers/development-testing/local-data/
- [wr-r2] https://developers.cloudflare.com/workers/wrangler/commands/r2/
- [tss] https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/

Spec:

- [fetch] https://fetch.spec.whatwg.org/#cors-safelisted-method

Third-party, not authoritative:

- [icarus] https://github.com/SunkenInTime/icarus/pull/423
- [xiaolee] https://github.com/ParaDevs-Brasil/XiaoLee-Mobile/pull/45
- [imore] https://www.imore.com/how-turn-4k-video-your-iphone-6s

## Recommendation

**Stream every upload through the Worker with the R2 binding. Add no presigned URLs and no S3
token.** This departs from Cloudflare's reference architecture on purpose: its main gain, keeping
large files off the Worker, matters less here than hard limits and a single simple path.

1. A TanStack **server route** (not `createServerFn`) takes a raw `PUT`. It checks session, org and
   permission, the type allow-list and `Content-Length`, then `put(key, request.body, ...)` and
   checks the returned `size`. Keys are always generated on the server.
2. Files under ~16 MiB (all Profile Photos, nearly all images): one `PUT`.
3. Larger files: Worker multipart, ~8 MiB parts, 2-3 in parallel, per-part retry, state in D1. Exact
   numbers belong to ticket 12.
4. Cleanup: bucket lifecycle `--abort-multipart-days 1`, plus a D1 `pending` row with an expiry
   sweep (ticket 11).

Why: it is the only path with a documented hard size limit. It reuses existing auth, with no bearer
URLs. It needs no secret, no CORS, and no reliance on the client to report completion. Dev runs
fully local, verified above. Cost is trivial, and multipart is wanted for phone retries anyway.

Accepted costs: a Worker request per part, the Worker in the data path, and Workers Paid in
practice.

**Revisit** if real-phone tests show the Worker limits throughput, or CPU per part becomes a
problem. Have the server hand the client each upload target, so video parts can move to presigned
`UploadPart` later without reworking the client. Before that move, run the presigned checks in Open
questions.
