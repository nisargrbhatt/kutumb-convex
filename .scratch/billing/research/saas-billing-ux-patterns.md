# SaaS billing UX patterns

Research for ticket `issues/04-saas-billing-ux-patterns.md`. Sources: vendors' own help/docs pages
(fetched 2026-11-13). Quotes kept short; rest paraphrased. Where a vendor page was silent, it says
so; nothing below is inferred from third-party blogs.

Caveat: most surveyed products (Slack, Notion, Vercel, Linear, GitHub) have a **free tier** to fall
back to. Kutumb has none, so their "downgrade to Free" maps to our **Lock**. Patterns are adapted
with that in mind.

## 1. Card-less trial onboarding

- **Slack**: paid-plan trial needs no card; "won't be charged unless you choose to upgrade". End
  date visible in the workspace menu. Upgrade during trial takes effect at trial end by default;
  charge + receipt issued then. Owners/admins can end trial early from Billing.
  https://slack.com/help/articles/202878523
- **Vercel**: Pro trial picked in the "create team" dialog (14 days). No card needed; to continue
  you add a payment method under Settings > Billing. Without one, team reverts to Hobby, and the doc
  states plainly you will **not** be charged. Billing starts right after trial ends if a card is on
  file. One trial per user account. https://vercel.com/docs/plans/pro-plan/trials
- **Stripe** (reference for how PSPs model it): trial without payment method is a first-class
  option; at trial end the subscription can `cancel`, `pause` (resume later on same sub), or
  `create_invoice` (-> `past_due`). Stripe warns card-less trials invite spam signups; recommends
  requiring an account first. `trial_will_end` webhook fires a few days before end.
  https://docs.stripe.com/billing/subscriptions/trials/free-trials

Patterns:

- Trial starts at org creation with zero payment UI (matches map). Adding a card mid-trial does
  **not** charge early; it just arms auto-conversion at trial end (Slack, Vercel).
- Always show the concrete end date, not just "N days left" (Slack menu, Vercel).
- State "you won't be charged unless you add a payment method" explicitly; it is the main trust
  signal of card-less trials (Slack, Vercel).
- Abuse guard: one trial per user, or trial only after account exists (Vercel, Stripe). Kutumb
  already caps orgs (`ORG_LIMIT`, ADR 0003), which partly covers this.

## 2. Trial countdown banner

Vendor help pages say little about banner design (Slack, Vercel silent). Synthesised pattern,
consistent with the above:

- Owners: thin persistent banner, neutral tone until last 3 days, then warning tone.
  - Copy: "Trial ends Nov 28 (5 days). Add payment details to keep Kutumb running." [Add payment]
  - With card on file: "Trial ends Nov 28. You'll be charged $5 then." [Manage billing] — banner
    becomes informational or disappears.
- Non-owners: nothing, or last-3-days soft note: "This community's trial ends soon. An owner needs
  to add payment details." No CTA they can't act on; optionally list owner names.
- Anti-pattern: dismissible-forever banner with no other surfacing; or showing billing CTA to
  people who can't pay.

## 3. Billing settings page

- **Linear**: Settings > Administration > Billing: plan, change/cancel, payment details, billing
  email, billing history; shows charges that are "failed or past due". Invoices final once issued.
  https://linear.app/docs/billing-and-plans
- **Notion**: Settings > Billing: change plan, change payment method any time, Invoices list with
  failed invoice retry. https://www.notion.com/help/upgrade-or-downgrade-your-plan
- **GitHub**: per-org "Billing & Licensing"; each org has its own receipt, billing date, period and
  payment method; payment history with receipt download.
  https://docs.github.com/en/billing/managing-your-billing/about-billing-on-github ;
  https://docs.github.com/en/organizations/managing-peoples-access-to-your-organization-with-roles/adding-a-billing-manager-to-your-organization

Pattern (single plan makes this short), top to bottom:

1. Status card: badge (`Trial` / `Active` / `Past due` / `Canceled — ends Dec 3` / `Locked`), one
   sentence explaining it, primary action for that state.
2. Next charge: "$5.00 on Dec 13" (or "No upcoming charge" when canceling/locked). Tax note if MoR
   adds tax.
3. Payment method: brand + last4 + expiry, [Update] (likely deep-link to Dodo portal).
4. Billing email / customer name (read-only or editable).
5. Invoice history table: date, amount, status, [Download]. (Matches CLAUDE.md "Simple Table".)
6. Danger zone: [Cancel subscription] (dialog), separate from delete org.

## 4. Failed payment / grace

- **Slack**: email owners + billing contacts immediately on failure; reminders around day 7, 14
  (owners, admins, payment contacts) and 21; downgrade to Free on day 28. Fix = owner updates
  payment method on Billing page.
  https://slack.com/help/articles/115004492008-Failed-or-late-payments
- **Notion**: email after each failure; up to 8 retries in the following month; then workspace is
  restricted to "limited-access for a period of time" before Free downgrade.
  https://www.notion.com/help/upgrade-or-downgrade-your-plan
- **GitHub**: past-due -> paid features locked. Fixing billing triggers new charge; unlock is
  automatic after success (may take up to 24h). "We do not ask you to pay for the time elapsed in
  locked mode." https://docs.github.com/en/billing/how-tos/troubleshooting/locked-account
- **Stripe**: email after each failed payment with hosted update-card link; separate expiring-card
  email 1 month ahead. https://docs.stripe.com/billing/revenue-recovery/customer-emails

Patterns:

- Grace window spans the PSP's retry schedule; lock only after retries are exhausted (Slack 28d,
  Notion ~1 month + limited-access phase). Locking while the PSP is still retrying causes
  "locked but then charged" confusion.
- Every failure message has a single fix action (update payment method) that retries immediately.
- Unlock is automatic on successful payment; no support ticket.
- Don't back-charge locked time (GitHub).
- Staged severity: owners first, broader roles only near the deadline (Slack tells admins day 7+,
  members via Slackbot before downgrade per Slack's help content).
- Owner grace banner copy: "Payment for <Org> failed on Dec 13. Update your card by Dec 20 to avoid
  losing access." [Update payment method]
- Expiring-card heads-up is cheap prevention (Stripe; check whether Dodo sends one).

## 5. Lock / paywall screen

No surveyed vendor fully locks (they downgrade). Closest: GitHub locked paid features, Notion
limited-access. Adapted pattern:

- Full-page interstitial inside app shell; org switcher and account menu stay usable (matches map's
  allowed list).
- Owner variant: title "<Org> is locked", body says why (trial ended / payment failed / canceled),
  reassurance "Your data is safe. Nothing has been deleted.", primary [Subscribe — $5/month] or
  [Update payment method], secondary links: billing page, delete org, transfer ownership.
- Non-owner variant: same title + reassurance, "Ask an owner to restore access", list owner names
  (maybe mailto), [Switch community], [Leave community]. No pay button.
- After payment: return to where they were; lift is immediate (poll/refetch until webhook lands;
  GitHub notes up to 24h lag, so show "Processing payment…" state instead of still-locked).
- Anti-patterns: implying data deletion; blank 403s from server fns with no explanation; paywall
  shown to non-owners.

## 6. Cancel and re-subscribe

- **Linear**: cancel takes effect at end of period; no refund for mid-period cancel; nothing
  deleted. https://linear.app/docs/billing-and-plans
- **Notion**: cancel via Settings > Billing; paid features stay "until the end of your billing
  cycle"; confirmation shows when plan ends. https://www.notion.com/help/upgrade-or-downgrade-your-plan
- **Stripe**: `cancel_at_period_end` reversible until period ends ("renew"); once fully canceled a
  new subscription is needed. Portal offers optional reason picker (8 canned reasons + free text)
  and optional retention coupon. https://docs.stripe.com/billing/subscriptions/cancel ;
  https://docs.stripe.com/customer-management/cancellation-page
- **Vercel**: after trial lapses, upgrade later restores full access; no charge for inactive months.
  https://vercel.com/docs/plans/pro-plan/trials

Patterns:

- Cancel dialog states the exact date access ends and that data is kept; one confirm, optional
  reason select. Copy: "Cancel subscription? <Org> stays active until Dec 13, then locks. Your data
  is kept and you can resubscribe any time."
- While pending cancel: status "Cancels on Dec 13" + [Resume subscription] (undo without new
  checkout).
- After Lock: re-subscribe = fresh checkout, new period starts at payment; no back-charge.
- Anti-patterns: retention mazes, hiding cancel, cancel only via support (also regulatory risk).

## 7. Reminder email cadence

| Event | Vendor evidence | Suggested for Kutumb (to owners) |
| --- | --- | --- |
| Trial ending | Stripe default 7 days before; immediately if trial < 7d (card-network driven) | T-3, T-1 (card-less: no charge risk). If card on file: consider T-7 "you'll be charged $5 on <date>" |
| Trial ended / locked | Vercel/Slack: revert, no charge | On Lock |
| Payment failed | Slack immediate + 7/14/21; Stripe each failure; Notion each failure | Immediately + one mid-grace + day-before-Lock |
| Expiring card | Stripe 1 month before | If Dodo doesn't send, optional |
| Receipt/invoice | GitHub emails receipts to billing managers on billing date | Leave to Dodo (matches map) |

Card-network note: Stripe's trial compliance page ties reminder emails, cancellation link on
receipts and "TRIAL OVER" statement descriptors to card network rules for trials that convert to
paid. https://docs.stripe.com/billing/subscriptions/trials/manage-trial-compliance — With Dodo as
merchant of record this may be Dodo's duty; ticket 03 should confirm.

## Anti-patterns summary

- Silent auto-charge after a trial with no pre-charge reminder.
- Locking before the processor's retry window ends.
- Billing CTAs / paywalls shown to members who can't pay.
- Ambiguous lock copy that suggests data loss.
- Requiring support to unlock or cancel.
- Charging for locked time on re-subscribe.
