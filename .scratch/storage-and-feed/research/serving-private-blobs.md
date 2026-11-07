# Research: Serving private blobs

Ticket: `.scratch/storage-and-feed/issues/02-serving-private-blobs.md`. Researched 2026-11-07.
Prices are Workers Paid list prices. `[Tags]` resolve in Sources. "Estimate" and "inference" mark
anything the docs do not state.

## TL;DR

- **Use a Worker-gated route on our own domain** with stable, opaque URLs. Do not use R2 presigned
  URLs: they are bearer links, so they break the "no public URLs" rule for their whole lifetime.
- **Money does not decide this.** A cold Feed page costs $0.000033 gated and $0.000018 presigned.
- **D1 is the real limit.** It runs one query at a time. A naive gate turns 1000 avatars into about
  3000 queries, roughly 3s of a single-threaded database for one viewer. The gate needs a short
  isolate memo, and the tree must not mount every avatar.
- **Browser cache does most of the work** (`private`, immutable bytes, 304 revalidation). Skip the
  Cache API in v1. Keep **Workers Cache off**: a hit skips the Worker, and so skips the gate.
- **Video** works through the gate, but the Worker must build the `206` itself. Cloudflare's R2
  example returns `200`, and WebKit requires `206`.
- **Variants** are made in the browser at upload. Cloudflare Images is not needed.

## Options

| | A. Gated route | B. R2 presigned GET | C. Worker route + our HMAC URL |
|---|---|---|---|
| URL | `/api/blob/<org>/<blob>/<variant>`, stable | `<account>.r2.cloudflarestorage.com/...` | A's URL plus `?e=&t=`, expiring |
| Check runs | Every request | Only at mint | Signature per request, record at mint |
| Worker in path | Yes | No | Yes |
| Browser cache | Good, URL is stable | Lost when URL changes | Lost when URL changes |
| Long-open tab | Keeps working | Breaks at expiry | Breaks at expiry |
| Bytes per URL, x1000 | 90 B, 88 KiB | 451 B, 440 KiB | 149 B, 146 KiB |
| Fits cached graph (ADR 0008) | Yes, it holds only ids | No, mint per response | No, mint per response |
| Same origin as app | Yes: no CORS, but see Security | No: CORS needed for browser use | Yes |

URL sizes were measured on sample strings with UUID ids. For A the graph can hold just the 36 B blob
id and the client builds the URL. Presigned facts: 1s to 7 days, GET/HEAD/PUT/DELETE, S3
API domain only, not custom domains, and the R2 binding cannot mint them. [R2 presigned]

Minting 1000 URLs took about 15ms (SigV4-style) or 8ms (one HMAC) in Node on this Mac. That is
indicative only, not workerd, but it is close to Workers Free's 10ms CPU limit. [Workers limits]

Rejected without a table row:

- **R2 custom domain + WAF token auth.** It needs a public bucket path, and
  `is_timed_hmac_valid_v0()` needs a Pro plan or higher. [R2 public buckets, WAF token]
- **Unguessable ids with an org-only check.** A member who saved a URL could still read a photo
  after its profile went `inactive`, which breaks the visibility rule.

## What a leaked URL gives

| Option | Who can read with only the URL | For how long | Kill switch |
|---|---|---|---|
| A | Nobody. Needs a live session, membership and record visibility | n/a | n/a |
| B | Anyone on the internet: that object, any byte range | Until expiry, up to 7 days | None per URL |
| C, not session-bound | Anyone: that blob and variant | Until expiry | Rotate secret (kills all URLs) |
| C, session-bound | Nobody without that session's cookie | n/a | n/a |

- **B** is documented as a bearer token: "Anyone with the URL can perform the specified operation
  until it expires". [R2 presigned] It also shows the account id, bucket and object key. A removed
  member, or a flip to `inactive`, does not stop it. The docs describe no revocation, and do not say
  whether revoking the signing token kills URLs already issued. [R2 tokens]
- **A residual:** bytes already fetched stay in that browser until `max-age`, and the gate memo can
  lag by its TTL (see Gate cost). Neither gives a stranger access.

## Caching private content

**Browser cache (use it).**

- Send `Cache-Control: private, max-age=86400, immutable` with an `ETag`. `private` forbids shared
  caches from storing the response. `immutable` stops revalidation while fresh. [RFC 9111, RFC 8246]
- This needs immutable bytes: a replaced photo or new crop gets a new blob id.
- After a day the browser revalidates, so the gate re-runs. Answer `304` from the Worker without
  touching R2, because a matching ETag on an immutable URL proves the bytes are the same.
  [RFC 9110 §13.1.2]
- Do not use R2 `onlyIf` for this. Failed preconditions are still billed. [R2 pricing]
- Skip `Vary: Cookie`: any cookie change would miss the cache (inference).
- The browser cache is not per user. Send `Clear-Site-Data: "cache"` on sign-out. [MDN CSD]

**Cache API (skip in v1).**

- It is safe behind the gate, because Workers run before the cache. [How the cache works]
- Limits: per data center, no tiered cache, `cache.delete` is local only, no
  `stale-while-revalidate`, 512 MB objects. [Cache API, Workers limits]
- `cache.put` returns `413` if `Cache-Control` says not to cache, and `Set-Cookie` responses are
  never cached. [Cache API] So it would need two header sets: `public` stored, `private` returned.
- `put` rejects `206`, which rules out cheap video caching. [Cache API]
- The gain is small. A hit still bills the Worker request and saves one Class B read ($0.36/M). It
  only helps a second viewer in the same colo, since the browser covers repeat views (inference).
- A deleted blob would keep serving from the colo until TTL unless the gate knows about the delete.

**Workers Cache (`cache.enabled`, keep off).**

- This is a different feature: "On a hit, the cached response is returned directly", with no Worker
  run. [Workers Cache]
- The key excludes `Cookie`, so requests differing only by cookie get the same response.
  [Workers Cache keys]
- With no `Cache-Control`, heuristic TTLs apply, such as 2h for a `200`. [Workers Cache config]
- So one enabled route could serve private bytes to anyone holding the URL. `wrangler.jsonc` has no
  `cache` block today; keep it that way. Send `private` or `no-store` on every blob response,
  errors included, which forces `BYPASS`. [Workers Cache config]

## Range requests for video

Serving through the Worker works, and range support is mandatory. Apple: servers "must support
byte-range requests". [Apple video] WebKit opens with a `0-1` probe and expects a `206` with 2
bytes. [WebKit 184447]

What the route must do:

- **Build the `206` itself.** The R2 example passes `range: request.headers` but returns `200` and
  sets no `Content-Range`. [R2 usage] A single-part `206` must carry `Content-Range`.
  [RFC 9110 §15.3.7.1] The cache's range reference does not cover uncached Worker responses.
  [CF range]
- **Handle `If-Range` in the Worker.** `onlyIf` supports conditional headers except `If-Range`.
  [R2 API] Immutable bytes make this a plain ETag comparison.
- **Parse `Range` ourselves** into one `R2Range`. It holds a single range, and a server may ignore
  Range, so answer a multi-range request with a `200`. [R2 API, RFC 9110 §14.2]
- **Stream the body straight through.** No buffering is needed. There is no response size limit, and
  no wall-time limit while the client stays connected. [Streams, Workers limits]

```ts
const object = await env.BLOBS.get(key, { range }); // range parsed from the header
const start = object.range?.offset ?? 0;
const length = object.range?.length ?? object.size;
headers.set("Accept-Ranges", "bytes");
headers.set("Content-Range", `bytes ${start}-${start + length - 1}/${object.size}`);
return new Response(object.body, { status: 206, headers });
```

Sketch only; a `suffix` range needs its own arithmetic.

- **Cost:** each range request is one Worker request and one Class B read, so at least 2 per play in
  Safari. Docs give no typical count; measure it.
- **Feed cards:** `preload="none"` plus a `poster` keeps video at zero bytes on page load. `preload`
  is only a hint, and `autoplay` overrides it. [MDN video]
- **Main risk:** iOS 10 stopped sending HttpOnly cookies on media loads. The bug closed as "should
  now be fixed in shipping software". [WebKit 161780] This needs a test on a real iPhone. If it
  fails, use option C for `<video src>` only.
- **Related:** HEVC is full support only in Safari, partial elsewhere. [caniuse HEVC] Some `.mov`
  uploads will not play on other browsers however they are served. Transcoding is out of scope.

## Cost: Feed page and tree

Prices: Worker $0.30/M after 10M/mo. Class B $0.36/M after 10M/mo. R2 egress $0. [Workers pricing,
R2 pricing] The pricing page lists no separate price for range reads, so I assume each is one
GetObject.

Feed page, 10 Posts x 5 media = 50 thumbnails, video posters included, no video bytes:

| Case | Worker requests | Class B | Cost |
|---|---|---|---|
| A cold | 50 | 50 | $0.000033 |
| A, browser cache fresh | 0 | 0 | $0 |
| A, after `max-age` (304) | 50 | 0 | $0.000015 |
| B cold, or any new URL | 0 | 50 | $0.000018 |
| C cold | 50 | 50 | $0.000033 |

Tree, 1000 avatars, worst case: A cold is 1000 requests and 1000 reads, **$0.00066**.

Monthly model (my assumption): 1000 members, each with 30 Feed pages and 4 tree views, all cold.

| Load | Blob requests/mo | Over allowance |
|---|---|---|
| 1 org, cold | 5.5M | $0, inside both allowances |
| 10 orgs, cold | 55M | $13.50 Worker + $16.20 R2 = $29.70 |
| 10 orgs, 80% browser hits | 11M | $0.66 |

Allowances are per account and rounded up to the next million. [R2 pricing] Add the $5 Paid minimum.
CPU is unmeasured: at an assumed 1ms per request, 5.5M requests use 5.5M of the 30M included CPU ms.

**Workers Free does not fit.** Its 100,000 requests/day is 100 cold tree views. [Workers pricing]

## Gate cost: D1, not dollars

- `getSession` reads D1 on every call here: `src/lib/auth.ts` sets no `cookieCache` or
  `secondaryStorage`.
- D1 is "inherently single-threaded": 1ms queries cap at 1000/s, and a full queue returns an
  "overloaded" error. [D1 limits]
- Estimate of 2-3 queries per blob: 50 thumbnails is about 150 queries (150ms of database time). 1000
  avatars is about 3000 (3s), competing with all other queries for the app.

Fix: a module-scope memo, TTL about 30s, like the isolate LRU in ADR 0008.

- `session token hash -> { userId, role per org }`
- `orgId -> Set(restricted blob ids)`: blobs whose owner not every member can see, such as photos on
  `inactive` or `draft` profiles.
- Unrestricted blob plus member: serve, no D1. Restricted blob: run the full owning-record check.
- Org id comes from the URL, and the R2 key derives from it, so a missing object is an R2 `404`.
- Keep pending uploads under a prefix this route never serves (ticket 11).

Limits of the memo:

- Store plain data only; I/O objects cannot cross requests. [Workers errors]
- Isolate reuse is not guaranteed. [CF caching research] Worst case is one read pair per isolate per
  TTL, plus a first wave that misses together before the first read returns.
- Hiding a photo, removing a member or revoking a session lags by up to the TTL.
- better-auth's `cookieCache` is not a substitute. It skips only the session read, and it adds
  revocation lag across the whole app. [better-auth sessions]

If the memo proves too weak, the session-bound option C needs no D1 at all, at the price of expiring
URLs.

## Avatar-heavy pages (community tree)

- Today (`community-tree/index.tsx`) nodes show a 36px avatar with initials only. The flow uses
  `fitView`, `minZoom={0.2}` and `onlyRenderVisibleElements`.
- Zoomed out, every on-screen node is mounted, so `loading="lazy"` helps little. A 36px avatar at
  0.2 zoom is about 7px.
- **Mount `<img>` only above a zoom threshold and keep initials below it.** This is the biggest
  saving, and it also fixes the D1 burst.
- Use one 128px variant, which covers 36-48 CSS px at 3x. At an estimated 5-10 KB each, the worst
  case is 5-10 MB on a first full view, then browser cache.
- The graph carries only blob ids, so the cached graph stays Actor-independent. A photo change must
  bump `orgDataVersion`.

Rejected:

- **Batch or sprite endpoint.** One request, but N R2 reads, with six in flight at a time and 50
  subrequests on Free. [Workers limits] It also loses per-image caching.
- **Base64 in the graph.** Adds an estimated 6.5 MB to a 0.4-0.9 MiB blob. [CF caching research]

## Thumbnails and sized variants without Cloudflare Images

| Option | Verdict |
|---|---|
| Browser canvas at upload, stored as separate R2 objects | **Use.** No server compute; crop UI (ticket 14) already has the pixels |
| Wasm in a Worker | Reject. Needs Paid CPU, and memory fails on large photos |
| Images binding | Fallback only; accepts HEIC. Billed as transformations, see limits below |
| Serve originals | Reject. Multi-MB photos on 36px avatars; HEIC unreadable outside Safari |

Suggested set: `avatar` 128px, `thumb` about 480w, `display` about 1600w, plus the original. The
sizes are starting points.

- **Encoding:** `toBlob` silently falls back to PNG on an unsupported type, so check `blob.type`.
  JPEG is the safe default. [MDN toBlob]
- **HEIC:** only Safari 17+ decodes it, so iPhone Safari is fine. [caniuse HEIF] Chrome, Firefox and
  Edge need a lazy-loaded Wasm decoder for files moved to a desktop; check its licence.
- **Video posters:** draw a `<video>` frame to canvas at upload. This only works where the browser
  decodes the codec, so keep a placeholder.
- **Trust:** the server cannot prove a variant matches its original. The worst case is a member
  posting an image they could post anyway. Ticket 03 should still check signature, dimensions and
  size for each variant.
- **Wasm memory:** decoded RGBA is 48 MB at 12 MP, 96 MB at 24 MP and 192 MB at 48 MP, against 128 MB
  per isolate. Free also has a 10ms CPU limit. [Workers limits]
- **Images limits:** 5,000 unique transformations/mo free, then new ones fail with `9422`; Paid is
  $0.50 per 1,000. Binding input limit is 20 MB. [Images pricing, Images limits] The pricing page
  does not say outright that the binding works on the Images Free plan, and HEIC-specific limits are
  not documented.

## Security: user bytes on the app origin

A and C serve uploads from `kutumb.nisargbhatt.org`, next to the session cookie. OWASP warns of
active content (XSS) in uploads and prefers a separate host. [OWASP upload] B avoids this by
accident. My suggested hardening:

- Send `Content-Type` from a verified allow-list (ticket 03), never the client's value.
- Do not serve SVG or HTML.
- Add `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox`.

## Sources

Cloudflare page dates are as shown on 2026-11-07, where given.

- [R2 pricing] https://developers.cloudflare.com/r2/pricing/ (2026-10-30)
- [R2 presigned] https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- [R2 tokens] https://developers.cloudflare.com/r2/api/tokens/
- [R2 API] https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
- [R2 usage] https://developers.cloudflare.com/r2/api/workers/workers-api-usage/
- [R2 public buckets] https://developers.cloudflare.com/r2/buckets/public-buckets/
- [WAF token] https://developers.cloudflare.com/waf/custom-rules/use-cases/configure-token-authentication/
- [Workers pricing] https://developers.cloudflare.com/workers/platform/pricing/
- [Workers limits] https://developers.cloudflare.com/workers/platform/limits/ (2026-10-29)
- [Workers errors] https://developers.cloudflare.com/workers/observability/errors/
- [Streams] https://developers.cloudflare.com/workers/runtime-apis/streams/
- [Cache API] https://developers.cloudflare.com/workers/runtime-apis/cache/
- [How the cache works] https://developers.cloudflare.com/workers/reference/how-the-cache-works/
- [Workers Cache] https://developers.cloudflare.com/workers/cache/ (2026-10-30)
- [Workers Cache config] https://developers.cloudflare.com/workers/cache/configuration/
- [Workers Cache keys] https://developers.cloudflare.com/workers/cache/cache-keys/
- [CF range] https://developers.cloudflare.com/cache/reference/range-requests/ (2026-09-14)
- [D1 limits] https://developers.cloudflare.com/d1/platform/limits/ (2026-10-30)
- [Images pricing] https://developers.cloudflare.com/images/pricing/ (2026-10-19)
- [Images limits] https://developers.cloudflare.com/images/get-started/limits/ (2026-06-16)
- [better-auth sessions] https://www.better-auth.com/docs/concepts/session-management
- [RFC 9110] https://www.rfc-editor.org/rfc/rfc9110.html
- [RFC 9111] https://www.rfc-editor.org/rfc/rfc9111.html (§5.2.2.7)
- [RFC 8246] https://www.rfc-editor.org/rfc/rfc8246.html (§2)
- [Apple video] https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/CreatingVideoforSafarioniPhone/CreatingVideoforSafarioniPhone.html
  (archived page)
- [WebKit 161780] https://bugs.webkit.org/show_bug.cgi?id=161780
- [WebKit 184447] https://bugs.webkit.org/show_bug.cgi?id=184447
- [MDN CSD] https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Clear-Site-Data
- [MDN toBlob] https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob
- [MDN video] https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video
- [caniuse HEIF] https://caniuse.com/heif
- [caniuse HEVC] https://caniuse.com/hevc
- [OWASP upload] https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- [CF caching research] branch `research/cf-caching-options`,
  `.scratch/mcp-v2/research/cf-caching-options.md`

## Recommendation

**Build option A: one Worker-gated route, `/api/blob/<org>/<blob>/<variant>`, for images and video.**
It is the only option where a leaked URL gives a stranger nothing and hidden records stay hidden
without expiring URLs. The extra cost over presigned is about $0.30 per million requests.

1. Route handler alongside `src/routes/api/ph/$.ts`. Gate first, then serve.
2. Gate with the 30s isolate memo. Restricted blobs take the full owning-record check.
3. `private, max-age=86400, immutable`, plus `ETag`. Answer `304` without R2. Errors get `no-store`.
4. Immutable blob ids: a new photo or crop is a new id.
5. Hand-built `206` handling for all blobs.
6. No Cache API, no `cache` block in `wrangler.jsonc`, and a test asserting blob response headers.
7. Client-made `avatar`, `thumb` and `display` variants at upload.
8. Tree mounts avatars only above a zoom threshold. Feed video uses `preload="none"` plus a poster.
9. Allow-listed `Content-Type`, `nosniff`, `CSP: sandbox`. `Clear-Site-Data: "cache"` on sign-out.

Verify in a prototype:

- `<video>` on a real iPhone with the HttpOnly session cookie, including seeking.
- D1 query count and p95 latency for a cold 1000-node tree, with the memo.
- CPU per blob request through the TanStack route.

Open questions:

- Workers Paid on this account? Required by this design.
- 30s hide lag at the gate OK?
- 1-day browser `max-age` OK for removed members?
- HEIC on desktop: Wasm decoder, or Images fallback?
