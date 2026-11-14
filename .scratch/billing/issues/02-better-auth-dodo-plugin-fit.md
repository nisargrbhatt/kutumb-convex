# better-auth Dodo plugin fit for org billing

Type: research Status: resolved Blocked by:

## Question

Does `@dodopayments/better-auth` (https://better-auth.com/docs/plugins/dodopayments) fit a
per-organization Subscription on this stack (better-auth organization plugin, D1/Drizzle, TanStack
Start on Cloudflare Workers)? It looks user-centric (customer per user on sign-up). Can checkout /
portal / webhooks be scoped to an org (referenceId, metadata, custom customer id)? What
tables/columns does it add, what endpoints, how are webhooks verified and routed, and does the Dodo
SDK run on Workers (fetch, no Node APIs)? Compare with using the `dodopayments` SDK directly plus
our own webhook route. Recommend one, with the trade-offs.

## Answer

Don't use the plugin. Use the `dodopayments` SDK directly, with our own webhook route and billing
tables.

- The plugin is built around users. It adds only `user.dodoCustomerId`. It finds the customer by
  user email. The portal and list endpoints use the session user. When a user is logged in,
  checkout-session replaces the `customer` in the body with the user's email. The only way to tie a
  checkout to an org is `referenceId`, which goes into `metadata.referenceId`. Nothing checks it, so
  any logged-in user can send any org id.
- Other problems: one portal shows every org a user owns. Portal endpoints refuse users whose email
  is not verified (we run with `requireEmailVerification: false`). There are no subscription tables
  and no webhook dedupe. Webhook handlers get the payload but no db/ctx.
- Webhooks use Standard Webhooks (HMAC, pure JS) at `/api/auth/dodopayments/webhooks`. The SDK's
  `client.webhooks.unwrap` uses the same library.
- Both the SDK and the plugin run on Workers: they use global `fetch` and have no `node:` imports.
  The SDK README lists Cloudflare Workers as supported.
- Direct SDK work: server functions `startCheckout` (`checkoutSessions.create` with `customer_id` =
  org customer and `metadata.organizationId`) and `openPortal`
  (`customerPortal.create(id, { return_url })`), both behind `assertCan` (owner). Plus a raw-body
  webhook route that dedupes by `webhook-id` and finds the org from metadata.
- Still open: Dodo allowing several customers with the same email (check in ticket 06), and the
  webhook path (suggest outside `/api/auth`).

Details and citations: `.scratch/billing/research/better-auth-dodo-plugin-fit.md`.
