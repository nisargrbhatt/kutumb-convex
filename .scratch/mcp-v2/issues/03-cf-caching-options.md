# Cloudflare caching options for per-org reads

Type: research Status: resolved Blocked by:

## Question

For per-org, Actor-scoped reads on Workers + D1, compare:

- KV: eventual consistency (~60s cross-colo), 1 write/sec/key, value size, cost.
- Cache API: per-colo, purge semantics.
- Isolate-level memo.
- D1 read replication / Sessions API (bookmarks for read-your-writes).
- Durable Objects as an org-level cache/coordinator.

For each: consistency guarantees, how read-your-writes can be achieved, invalidation cost
(delete-on-write vs generation-counter keys), and pricing at about 1000 profiles/org with chatty AI
Clients. Also check the current KV graph blob's size at 1000 profiles against limits.


## Answer

Resolved 2026-10-22 (research).

Gist:
- KV is eventually consistent (~60s+), and same-colo read-your-writes is "not guaranteed".
- Today's delete-on-write gives no read-your-writes and has a race: a rebuild `put` that lands
  after the delete pins a stale blob for up to the 1h TTL.
- A generation counter held in KV is also broken (eventual, 1 write/s/key).
- Cache API is per-colo, and global purge is rate-limited (Free: 5/min).
- An isolate memo is safe only with versioned keys.
- D1 Sessions give read-your-writes via bookmarks, but are in beta and MCP clients won't echo a
  bookmark.
- A Durable Object per org is strongly consistent, but costs about $4/org/mo if always awake.
- The blob at 1000 profiles is about 0.4–0.9 MiB, well under the 25 MiB KV limit.

Recommendation:
- Keep a per-org `graphVersion` in D1, bumped in the same batch as each `makeProfileChanges` apply
  and each custom-field definition write.
- Use immutable cache keys `graph:{org}:v{n}`, looked up isolate LRU → KV → D1 rebuild.
- The blob is Actor-independent. Visibility is applied in-worker, and the Actor's own drafts are
  fetched live.
- Result: read-your-writes for every Actor, zero lag, no invalidation needed, at the cost of 1 PK
  read per request.
- Skip Cache API and Durable Objects. D1 replication is optional later, for latency.

Open for the caching design:
- Should the version column live on `organization` or in its own table?
- Should members see email/mobile in the shared blob?
- Is a D1 primary round-trip on every app page acceptable?

Context: branch `research/cf-caching-options`, file
`.scratch/mcp-v2/research/cf-caching-options.md`.
