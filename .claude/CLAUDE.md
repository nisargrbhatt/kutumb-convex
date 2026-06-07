# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository.

- In all interactions and commit messages, be extremely consice and sacrifice grammar for the sake
  of concision.

## Overview

Kutumb is a multi-tenant community-management SaaS built on **TanStack Start** (full-stack React,
SSR) deployed to **Cloudflare Workers**. Despite the directory name (`kutumb-convex`), this project
does **not** use Convex — persistence is **Cloudflare D1** (SQLite) via **Drizzle ORM**, with
**Cloudflare KV** for caching. Auth is **better-auth** (with its organization plugin for
multi-tenancy), billing is **Polar**, analytics is **PostHog**, and transactional email is
**Resend** + **react-email**.

## Commands

```bash
npm run dev            # Vite dev server on :3000 (README's "npm run start" is wrong; there is no start script)
npm run build          # Production build
npm run test           # Run Vitest once
npx vitest <pattern>   # Run a single test file / watch mode
npm run lint           # oxlint
npm run lint:fix       # oxlint --fix
npm run format         # oxfmt --check
npm run format:fix     # oxfmt (writes)
npm run email:dev      # Preview react-email templates on :3001
npm run deploy         # build + wrangler deploy
```

### Database / migrations (Drizzle + D1)

```bash
npm run migration:generate        # generate SQL from src/db/schema.ts into ./migrations
npm run migration:migrate:local   # apply to local D1
npm run migration:migrate:prod    # apply to remote D1 (wrangler d1 migrations apply D1 --remote)
```

`drizzle-kit generate` (migration:generate) needs `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_DATABASE_ID`,
and `CLOUDFLARE_D1_TOKEN` in `.env` (see `drizzle.config.ts`). After editing the schema, always
generate a migration — the schema file alone does not change the database.

## Architecture

### Server functions are the API layer

There is no REST/RPC framework. Backend logic lives in **TanStack `createServerFn`** functions split
across two directories — the distinction is a convention, not enforced:

- `src/handler/*` — server functions consumed directly by route `beforeLoad`/`loader`.
- `src/api/*` — server functions that also export a **`queryOptions` factory** (e.g.
  `checkCurrentOrgPaymentSetupQuery`) for use with TanStack Query on the client.

Standard pattern: `createServerFn({ method }).middleware([authMiddleware]).handler(...)`.
`authMiddleware` (`src/middleware/auth.ts`) resolves the better-auth session, redirects to `/login`
if absent, and injects `context.session` / `context.userId`. The active tenant is always
`context.session.session.activeOrganizationId` — most queries scope by this org id.

For any other reference, lookout for `/tanstack-start-best-practices`, `/tanstack-query-best-practices` skill for better planning and reasoning.

### Auth & multi-tenancy (`src/lib/auth.ts`)

better-auth is configured with the **organization plugin**. Each organization is a tenant; users
belong to orgs with roles `owner | admin | member`. Permissions use better-auth **access control**
(`src/lib/permission.ts`) with custom statements (`communityProfile`, `customFields`) — check them
server-side via `auth.api.hasPermission({ headers, body: { permissions: {...} } })`, never trust the
client. Org `metadata` is a JSON string blob (always parse defensively, e.g. via `safeSync`); it
stores `paymentSetup` and the Polar `customerId`.

The better-auth HTTP handler is mounted at the catch-all route `src/routes/api/auth/$.ts`. Org
lifecycle hooks (e.g. `afterAddMember`) and invitation emails are wired inside the `auth` config.

For any other reference, lookout for `/better-auth-best-practices`, `/better-auth-security-best-practices` skill for better planning and reasoning.

### Routing (file-based, TanStack Router)

Routes live in `src/routes`; `routeTree.gen.ts` is **generated — never edit by hand**. Key layout
segments:

- `__root.tsx` — loads session into router context via `authStateFn`; wraps app in PostHog
  provider + Toaster.
- `_authed.tsx` — gate: redirects unauthenticated users to `/login`, and users without an
  `activeOrganizationId` to `/onboarding/create`.
- `_authed/_community.tsx` — gate: calls `checkOrgPaymentDone`; renders `PaymentRequiredBanner`
  instead of the app shell until the org completes Polar payment setup. Feature routes (dashboard,
  members, profile, settings, community-tree, memories) live under here.

For any other reference, lookout for `/tanstack-start-best-practices`, `/tanstack-query-best-practices` skill for better planning and reasoning.

### Billing & analytics

- **Polar** (`src/lib/polar.ts`) — sandbox vs production switched by `POLAR_MODE`. Integrated into
  better-auth via `@polar-sh/better-auth` (checkout, portal, usage, webhooks); usage events are
  ingested in org hooks.
- **PostHog** is proxied to avoid ad-blockers: client sends to `/api/ph`, and
  `src/routes/api/ph/$.ts` reverse-proxies to `VITE_PUBLIC_POSTHOG_HOST`. Server-side capture lives
  in `src/lib/posthog-server.ts`.

### Database schema (`src/db`)

`schema.ts` re-exports `auth-schema.ts` (better-auth tables) and `app-schema.ts` (domain tables:
`communityProfile`, `communityProfileCustomField`, addresses, relations, etc.). **Enum-like string
columns draw their allowed values from `src/db/constants.ts`** — add/change enum values there, not
inline. `db` (`src/db/index.ts`) is the Drizzle client bound to the `D1` Cloudflare binding.

## Conventions

- **Cloudflare bindings** are accessed via `import { env } from "cloudflare:workers"` (typed by
  `worker-configuration.d.ts`, regenerate with `npm run cf-typegen`). Bindings: `D1`, `KV`.
- **Error handling:** wrap fallible calls with `safeAsync` / `safeSync` (`src/lib/safe.ts`) instead
  of ad-hoc try/catch when you want a `{ success, data | error }` result.
- **Path alias:** `@/*` → `src/*`.
- **Formatting:** oxfmt enforces **tabs**, 100-col width, semicolons, ES5 trailing commas. oxlint
  enforces `consistent-type-imports` (use `import type`), `prefer-const`, and
  `arrow-body-style: as-needed`. Run `npm run format:fix && npm run lint:fix` before committing.
- **UI:** shadcn/ui ("new-york" style) in `src/components/ui`, Tailwind v4, lucide icons. Forms use
  react-hook-form + zod resolvers.

## Github

- Your primary method for interacting with Github should be the Github CLI.

## Plans

- At the end of each plan, give me a list of unresolved questions to answer, if any. Make the
  questions extremely consice. Sacrifice grammar for the sake of concision.

## Page Design

- [IMPORTANT] All pages must be fully responsive across all the breakpoints. Mobile, Tablet, Desktop, Ultrawide every device should be able to see the application properly.
- Page must have breadcrumbs in the top part. Every part of UI should be accessible.
- Use Tailwind for styling the components and elements.

## Form handling

- Always use `react-hook-form` for form handling and `zod` for form schema validation.

## Agent skills

### Issue tracker

Issues and PRDs live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage roles recorded as `Status:` lines (default vocabulary). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.