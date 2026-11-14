# Dodo owns the Trial clock

Creating an organization also creates its Dodo customer and a card-less Subscription server-side
(`POST /subscriptions`, product flag "Start the trial without a card"), so the Trial is Dodo's first
billing period and its end is Dodo's first charge date. The org create form collects a billing
address because that call takes one. One clock, one source of truth: our D1 row mirrors Dodo, and
adding payment details mid-Trial needs no checkout arithmetic.

- **Considered**: our own clock in D1 with no Dodo objects until the owner pays, then a checkout
  with `trial_period_days` = days left. No address at org create, no deprecated endpoint, no Dodo
  litter from abandoned orgs, but two clocks that must agree and a checkout before the card can be
  saved.
- **Consequences**: `POST /subscriptions` is marked deprecated in Dodo's SDK; if it goes, org create
  must move to a checkout flow. Every abandoned org leaves a Dodo customer + Subscription (no
  delete-customer API). Dodo's untoggleable "add payment method" reminder goes to the customer's one
  email. If Dodo is down at org create, the org trials from its own `createdAt` until a Subscription
  exists.
