# 10 — Docs: CLAUDE.md, ADR 0002 amend, ADR 0003, CONTEXT.md

Parent: [PRD.md](../PRD.md) §9, §10 Label: `impl` Status: `ready-for-agent` Depends on:
[08](08-limits-lib-and-enforcement.md)

## Goal

Repo docs describe the free app with hard caps; nothing mentions Polar or Stripe as live.

## Scope

1. **`.claude/CLAUDE.md`**:
   - :12 drop "billing is **Polar**".
   - :24 `queryOptions` example `checkCurrentOrgPaymentSetupQuery` → `getOrgUsageQuery`.
   - :41 drop "stores `paymentSetup` and the Polar `customerId`" (org `metadata` note can stay
     generic or go).
   - :58-59 `_authed/_community.tsx` → "layout shell for feature routes (dashboard, members, …); no
     gate of its own — `_authed.tsx` handles session/org redirects."
   - :65 heading "Billing & analytics" → "Analytics".
   - Add under Conventions: "**Limits:** `ORG_LIMIT`/`MEMBER_LIMIT` hardcoded in `src/lib/limits.ts`
     (pure, client-safe); counters in `src/lib/limits-db.ts`. Enforced in better-auth org hooks +
     profile insert sites. See ADR 0003."
   - Consult `/mattpocock-skills:writing-for-agents` before editing.
2. **`docs/adr/0002-billing-known-limitations.md`** → rename to
   `docs/adr/0002-auth-known-limitations.md`; title "Auth known limitations — accepted tradeoffs,
   not bugs"; intro "Five" → "Four", strip "Stripe billing/"; **delete bullet 1** (webhook org
   deletion). Append: "_Amended 2026-09-17: the Stripe org-deletion bullet was removed with the
   billing rip (`.scratch/free-tier`). Remaining bullets unchanged._" Not superseded.
3. **`docs/adr/0003-hardcoded-free-tier-limits.md`** — format like 0001 (title = decision, prose,
   what was rejected and why). Three bullets, each with reasoning:
   - **Limits are constants, not config.** `ORG_LIMIT = 5`, `MEMBER_LIMIT = 1000` in
     `src/lib/limits.ts`. Rejected env var / per-org override: pre-launch, single tier, YAGNI; a
     paid tier is a fresh effort.
   - **Pending invitations reserve a Member-limit slot.** Invite send counts `member` rows + pending
     invitations. Rejected counting members only: an org could hold 1000 members + unbounded invites
     that can never be accepted (native `membershipLimit` blocks), a confusing dead end.
   - **Count-then-insert race accepted.** Two concurrent creates can overshoot by one. Rejected D1
     transaction / unique-index tricks: D1 has no interactive transactions inside better-auth hooks,
     cap is soft in practice, overshoot by one is harmless. Also note: accept path evaluates native
     `membershipLimit` before `beforeAcceptInvitation`, so member-limit error wins when both caps
     hit.
4. **`CONTEXT.md`** — already edited in working tree (Organization limit / Member limit added,
   billing terms removed). Review once against PRD §1, commit as part of this ticket.
5. Grep docs:
   `grep -rn "Polar\|Stripe\|paymentMiddleware\|checkOrgPaymentDone" .claude docs CONTEXT.md README.md`
   → only hits are the ADR 0002 amendment note and `.scratch/` history.

## Acceptance

- CLAUDE.md reads true against the post-08 codebase (every file/fn it names exists).
- `docs/adr/` has 0001, 0002 (renamed, 4 bullets + amendment), 0003.
- `CONTEXT.md` committed; glossary matches PRD.
- `npm run format:fix` clean (oxfmt formats md too if configured; otherwise 100-col wrap by hand).

## Out of scope

Code changes. `.scratch/stripe-billing/**` stays as historical record.
