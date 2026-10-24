# Graph cache: per-org D1 version + immutable versioned keys

The org graph blob is cached under `graph:{org}:v{n}`, where `n` comes from an `orgDataVersion`
table in D1 that every applied `makeProfileChanges` plan bumps inside the same batch. Readers read
the version (one PK read), then try isolate LRU → KV → D1 rebuild; keys are never deleted or
overwritten (KV TTL 24h is GC only). This gives zero staleness for every Actor, including an AI
Client reading its own write.

- **Considered**: KV delete-on-write (today's approach; racy, and KV's ~60s cross-colo propagation
  can't give read-your-writes); D1 Sessions bookmarks per client (per-client state, still needs
  invalidation); Cache API / Durable Objects (per-colo or extra infra for a ≤1 MiB blob).
- **Consequences**: own table rather than a column on better-auth's `organization`. Rebuild reads
  version + data in one `db.batch` so a blob is never newer-keyed than its data. Only the graph blob
  is cached; everything else reads D1 live. Stampede on a new version is accepted.
