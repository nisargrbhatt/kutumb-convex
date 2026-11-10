# Server entry and R2 binding

Status: resolved Blocked by:

## What to build

Give the Worker its own entry so blob routes can run ahead of TanStack and a cron can run. No blob
behaviour yet.

- `src/server.ts` exports `fetch` and `scheduled`. `fetch` hands everything to TanStack, except
  `/api/blob/*`, which returns `404` for now. `scheduled` is a no-op.
- `wrangler.jsonc`: `main`, `triggers.crons` `0 * * * *`, `r2_buckets` binding `BLOBS` to
  `kutumb-blobs`. No `cache` block, no `remote: true`.
- `npm run cf-typegen`.

## Spec

[spec.md](../spec.md): Blobs > R2, Blobs > Sweep, Serving.

## Done when

- [ ] `npm run dev` serves the app through `src/server.ts`: SSR, server functions, `/api/auth/*`.
- [ ] `/api/blob/x` returns `404` from `src/server.ts`, not TanStack's page.
- [ ] `npm run build` passes.
- [ ] `scheduled` runs from a built app locally. Ticket 17: the local trigger needed `assets`
      removed.

## Human step

Before deploy: `wrangler r2 bucket create kutumb-blobs --location apac`. Local Uploads off.

## Comments

Merged 1a04eb8 on feat/storage-integration.
