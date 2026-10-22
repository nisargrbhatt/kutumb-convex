# Research: Cloudflare caching options for per-org, Actor-scoped reads

Ticket: `.scratch/mcp-v2/issues/03-cf-caching-options.md`. Researched 2026-10-22.

## TL;DR

- Today's KV delete-on-write **cannot give read-your-writes (RYW)**. It also has a race that can
  pin a stale blob for up to 1h (see "Current design bugs").
- KV blob at 1000 profiles ≈ **0.4–0.9 MiB**. The KV value limit is 25 MiB, so size is a non-issue.
- **Recommend:** a strongly consistent per-org `graphVersion` in D1, bumped in the same D1 batch as
  every mutation through `makeProfileChanges` (plus custom-field def writes). Cache keys include
  the version: `graph:{org}:v{n}`. The lookup order is isolate memo → KV → D1 rebuild. Immutable
  keys mean no invalidation, no stale reads, and RYW for **every** Actor. The cost is one indexed
  1-row D1 read per request.
- Cache only Actor-independent org data (active graph, custom field defs/values). Apply visibility
  in the Worker, and fetch the Actor-specific extras (own draft/inactive profile) live from D1.
- Skip the Cache API (per-colo, purge rate limits) and Durable Objects (cost and new infra are not
  justified at ≤1000 profiles). D1 read replication is optional later, only for latency.

## Current design bugs (`src/lib/communityGraphCache.ts`)

1. **No RYW.** KV reads are served from per-location caches. The default `cacheTtl` is 60s and
   the minimum is 30s. A writer's next read in the same colo "usually" sees the delete, but this is
   "not guaranteed". Other colos see it after "up to 60 seconds or more". Missing-key lookups are
   cached too. [KV how it works]
2. **Rebuild/delete race.** Reader R misses the cache, builds the blob from D1, then writer W
   commits and deletes the key, then R `put`s its pre-write blob. The stale blob then lives until
   the 1h `expirationTtl`. Nothing detects it.
3. **Hot-key put storms.** After a delete, concurrent misses all `put` the same key. KV allows
   **1 write/sec per key**, so the extra puts fail. [KV limits]

## Blob size estimate (GraphProfile + GraphEdge, JSON)

Measured with `JSON.stringify` on synthetic data: UUID ids, long Indian names, every nullable
field filled in the "full" case.

| Case | Bytes/profile | Edges | Total |
|---|---|---|---|
| sparse profiles, 1 edge/profile | 244 | 1000 × 158 B | **≈395 KiB** |
| full profiles, 2 edges/profile | 320 | 2000 × 158 B | **≈624 KiB** |
| full profiles, 4 edges/profile | 320 | 4000 × 158 B | **≈935 KiB** |

Adding custom field values (say 10 fields × ~30 B) adds about 300 KB, so the blob stays ≲1.5 MiB.

- KV value limit is 25 MiB, so there is more than 15× headroom. [KV limits]
- DO SQLite key+value limit is 2 MB. That is fine in DO memory, but tight if persisted as one row.
  [DO limits]
- Worker isolate memory is 128 MB, shared across requests. Memoizing about 20–50 org blobs per
  isolate is OK. Use an LRU cap. [Workers limits]
- Cost to watch: `JSON.parse` of about 1 MiB on every KV hit is CPU time. An isolate memo avoids
  it. (This is an estimate, not benchmarked.)

## Options

### 1. Workers KV

- **Consistency:** eventual. Reads come from the location cache, which honours `cacheTtl` (default
  60s, minimum 30s). Same-location RYW is "usually" true but "not guaranteed". Missing keys are
  cached too. Concurrent writes are last-write-wins. [KV how it works]
- **Limits:** 1 write/s per key. Values up to 25 MiB, keys 512 B, metadata 1024 B. 1000 ops per
  invocation. [KV limits]
- **RYW:** not achievable with KV alone. CF suggests routing writes through a DO if you need
  stronger consistency. [KV how it works]
- **Invalidation:**
  - Delete-on-write: has the race and staleness above, and costs $5/M deletes.
  - Generation counter **stored in KV**: broken. The counter itself is eventually consistent and
    limited to 1 write/s.
  - Generation counter **stored in a strong store** (D1 or DO), with KV holding immutable
    `…:v{n}` blobs: correct. A stale or negatively cached KV entry only lowers the hit rate. Old
    versions expire by TTL.
- **Pricing (Paid):** 10M reads/mo included, then $0.50/M. 1M writes, deletes and lists each
  included, then $5/M. 1 GB storage included, then $0.50/GB-mo. Reads of missing keys are billed.
  [KV pricing]
- **"Workers KV Instant"** is a private beta listed on the limits page. Each namespace is limited
  to 1 MB total and 1 write/s. The docs say nothing about its consistency. Our 1 MiB blob alone
  hits the namespace cap, so it is not usable here. [KV limits]

### 2. Cache API (`caches.default`)

- **Consistency:** per colo. Contents "do not replicate outside of the originating data center".
  [Cache API]
- **Purge:** `cache.delete` purges only the local colo. A global purge needs the zone purge API,
  and "not all cache purge endpoints function" for Cache API entries. URLs with a Worker-set custom
  cache key can't be purged by URL. [How the cache works]
- **Purge rate limits** (tag, host, prefix and everything, per account): Free 5/min, Pro 5/s,
  Business 10/s. Single-URL purges: 800–1500/s. [Purge cache]
  - Per-write tag purges on the Free plan are not viable.
- **Constraints:**
  - Works only on custom domains (we have `kutumb.nisargbhatt.org`), not in previews.
  - No `stale-while-revalidate`.
  - Responses with `Set-Cookie` are never cached.
  - `cache.put` is not compatible with tiered cache.
  - [Cache API]
- **RYW:** only with version-in-key, and the version must come from a strong store. In that setup
  it is just a per-colo L2 behind the isolate memo, and redundant with KV.
- **Pricing:** no separate line item in Workers pricing. [Workers pricing]

### 3. Isolate-level memo (module-scope `Map`)

- **Consistency:** none across isolates. The docs say there is "no guarantee that any two user
  requests will be routed to the same" instance, that isolates are "not necessarily long-lived",
  and that CF "recommend[s] you do not use or mutate global state". [How Workers works]
- **Safe usage:** key the memo by `{org}:v{n}` from a strong version source. The memo is then an
  immutable lookup, so mutation hazards don't matter, and a stale entry is never served. Cap it
  with an LRU, because the 128 MB limit is per isolate. [Workers limits]
- **Invalidation:** none needed with versioned keys.
- **Pricing:** free. It saves KV reads and `JSON.parse` CPU.

### 4. D1 read replication + Sessions API

- **Consistency:** replicas are asynchronous. A session gives sequential consistency, including
  monotonic reads and "Read my own writes: If you write to the database, all subsequent reads will
  see the write." [D1 read replication]
- **API:** `env.D1.withSession(c)` with `c` = `first-unconstrained` (default), `first-primary`, or
  a bookmark. The `D1DatabaseSession` has `prepare`, `batch` and `getBookmark` (no `exec` is
  documented). Bookmarks cross requests via a header (`x-d1-bookmark` in the example).
  [D1 database API]
- **Status:** public beta since 2025-04-10. No GA entry found. Worker binding only (not REST).
  Disabling replication takes up to 24h. [D1 changelog, D1 read replication]
- **RYW across requests:** the next request must carry the bookmark.
  - Browsers can echo a header.
  - MCP AI Clients won't. The bookmark must be stored server-side per Connection
    (`clientId:userId`). KV is eventually consistent, so it is not a reliable store for that. A
    DO would work.
  - Simplest path: run MCP/write paths with `first-primary`, or don't enable replication. The
    primary alone is strongly consistent.
- **Drizzle:** `drizzle-orm@0.45.2` types `drizzle()` for `D1Database` only (`AnyD1Database`).
  Passing a session needs a cast, and the module-level `db` singleton (`src/db/index.ts`) must
  become per request. This was not runtime-verified.
- **Pricing:** no extra cost for replicas. Billing is by rows: 25B reads/mo included, then
  $0.001/M; 50M writes included, then $1/M. [D1 pricing]
- **Throughput:** a DB is "single-threaded, and processes queries one at a time". A 1 ms query
  gives about 1000 qps. [D1 limits]
  - This is the real reason to cache: the `get_profile` fan-out (about 6 queries) uses up the
    serial throughput of the shared DB.

### 5. Durable Object per org (cache + coordinator)

- **Consistency:** single-threaded, globally unique, strongly consistent storage. In-memory state
  is lost on hibernation or eviction. The DO is placed near the first request. [What are DOs]
- **RYW:** yes for all Actors, if every write notifies the DO (bump version or drop the blob) and
  every read goes through it. A failed notify means stale data, so keep a version check or TTL
  backstop. It also gives a natural place to store per-Connection D1 bookmarks and quotas.
- **Limits:** soft limit of 1000 rps per object. 10 GB SQLite per object. 2 MB key+value.
  [DO limits]
- **Pricing (Paid):** 1M requests included, then $0.15/M. 400k GB-s included, then $12.50/M GB-s.
  SQLite rows are priced like D1. [DO pricing]
  - Duration is billed by wall clock while the object is active, at a 128 MB allocation.
- **Latency:** one extra hop to a single location. This is the same latency class as the D1
  primary, so it is no better than option 4 on primary.

## Comparison

| | KV (today: delete-on-write) | Cache API | Isolate memo | D1 replicas + Sessions | DO per org | **Recommended: D1 version + memo + KV** |
|---|---|---|---|---|---|---|
| Consistency | eventual, ≥60s typical | per colo only | per isolate only | sequential per session | strong | strong (version from D1 primary) |
| Writer RYW | no | no (without version key) | no (without version key) | yes, with bookmark plumbing | yes | **yes** |
| Others' lag bound | 60s+ (1h with race) | TTL | isolate lifetime | replica lag | 0 | **0** |
| Invalidation | delete ($5/M) + race | zone purge (rate-limited) | n/a | n/a | RPC notify | **none; immutable keys + TTL** |
| Size fit (≈1 MiB) | 25 MiB OK | OK | 128 MB/isolate, LRU | n/a | 2 MB/row; memory OK | 25 MiB OK |
| New infra | none | none | none | enable replication; per-request `db` | DO class + migration | 1 column + bump in seam |
| Maturity | GA | GA | n/a | beta | GA | GA |

### Cost at 1000 profiles/org with chatty AI Clients

Assumptions per org per month: 300k reads (about 10k/day: 5 AI Clients plus app traffic; the
`/api/mcp` cap is 60/min per Connection), 6k writes, blob rebuild ≈ 3k D1 rows read.

| Option | Per org/mo | 100 orgs/mo |
|---|---|---|
| KV delete-on-write | 300k reads + 12k write/delete ≈ $0.21 above free | ≈$10 (30M reads; 20M over) + ~$1 writes |
| Recommended | +300k D1 rows (~$0). KV gets drop with memo hits. 6k puts | ≈$0–10 (KV reads fall with memo hit rate) |
| Cache API | ~$0 | ~$0, but purge-limited |
| D1 Sessions | $0 extra | $0 extra |
| DO per org, always awake | 300k req (~$0.05) + 0.128 GB × 2.59M s ≈ 332k GB-s ≈ **$4.15** | **≈$415** + requests |
| DO per org, 2h/day active | ≈ 27.6k GB-s ≈ $0.35 | ≈$30 |

D1 row costs are negligible at this scale. The binding constraint is D1 serial throughput and
latency, not dollars. The DO math is derived from the price list, not measured.

## Recommendation

1. Add `graphVersion INTEGER` per org: a column on `organization`, or a 1-row-per-org table.
   - Increment it inside the **same D1 batch** as each direct apply in `makeProfileChanges`.
     Replace `onGraphChanged`'s delete with this.
   - Also bump it on Custom Field Definition writes (outside the seam) and on Change Request
     approvals.
2. Read path in `domain/queries`:
   - Read the version (PK lookup, 1 row).
   - Then the isolate LRU `Map<org:v, blob>`, then KV `graph:{org}:v{n}` (`get`; on miss, rebuild
     from D1 and `put` via `waitUntil`, ignoring 429s, with `expirationTtl` about 1h), then D1.
3. Keep the blob Actor-independent: active profiles, edges, custom field defs and values.
   - Apply `visibleProfileWhere` semantics in the Worker.
   - Members' own draft or inactive profile comes from a small live D1 query.
4. Result:
   - RYW for writers and zero lag for others (the version is read from the primary every time).
   - No delete race. The 1 write/s per-key limit only affects first fill.
5. Later, only if latency matters: enable D1 replication.
   - Non-writing reads use `first-unconstrained` (version lag = replica lag, a bounded lag that
     matches the map's "others may lag" rule).
   - Writing Connections pin `first-primary` for N seconds after a write, tracked in the memo or a
     DO.
6. Revisit DO per org only if we need cross-request coordination anyway (quotas, bookmarks,
   websockets).

## Open questions

- Version column on `organization` (a better-auth table) or a separate table?
- Should members be allowed to see email/mobile in the shared blob? The blob holds them today.
- Is the D1 primary latency on every request acceptable for app pages, or only for MCP?

## Sources

- [KV how it works]: https://developers.cloudflare.com/kv/concepts/how-kv-works/
- [KV limits]: https://developers.cloudflare.com/kv/platform/limits/
- [KV pricing]: https://developers.cloudflare.com/kv/platform/pricing/
- [Cache API]: https://developers.cloudflare.com/workers/runtime-apis/cache/
- [How the cache works]: https://developers.cloudflare.com/workers/reference/how-the-cache-works/
- [Purge cache]: https://developers.cloudflare.com/cache/how-to/purge-cache/
- [How Workers works]: https://developers.cloudflare.com/workers/reference/how-workers-works/
- [Workers limits]: https://developers.cloudflare.com/workers/platform/limits/
- [Workers pricing]: https://developers.cloudflare.com/workers/platform/pricing/
- [D1 read replication]: https://developers.cloudflare.com/d1/best-practices/read-replication/
- [D1 database API]: https://developers.cloudflare.com/d1/worker-api/d1-database/
- [D1 pricing]: https://developers.cloudflare.com/d1/platform/pricing/
- [D1 limits]: https://developers.cloudflare.com/d1/platform/limits/
- [D1 changelog]: https://developers.cloudflare.com/changelog/post/2025-04-10-d1-read-replication-beta/
  and https://blog.cloudflare.com/d1-read-replication-beta/
- [What are DOs]: https://developers.cloudflare.com/durable-objects/concepts/what-are-durable-objects/
- [DO limits]: https://developers.cloudflare.com/durable-objects/platform/limits/
- [DO pricing]: https://developers.cloudflare.com/durable-objects/platform/pricing/
- Code: `src/lib/communityGraphCache.ts`, `src/lib/profileChanges.ts`,
  `src/domain/queries/profiles.ts` (`visibleProfileWhere`), `src/db/index.ts`, `wrangler.jsonc`,
  `node_modules/drizzle-orm/d1/driver.d.ts`.
