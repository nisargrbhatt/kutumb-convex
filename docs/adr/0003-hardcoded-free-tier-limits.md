# Free-tier org/member limits are hardcoded constants, not config, with an accepted race

`ORG_LIMIT = 5` and `MEMBER_LIMIT = 1000` live as plain constants in `src/lib/limits.ts` and are
enforced by count-then-compare checks in better-auth org hooks and the profile insert sites — no
external config, no transactional guarantee beyond a single D1 write.

- **Limits are constants, not config.** `ORG_LIMIT = 5`, `MEMBER_LIMIT = 1000` in
  `src/lib/limits.ts`. Rejected env var / per-org override: pre-launch, single tier, YAGNI — a paid
  tier is a fresh effort.

- **Pending invitations reserve a Member-limit slot.** Invite send counts `member` rows + pending
  invitations. Rejected counting members only: an org could hold 1000 members plus unbounded invites
  that can never be accepted (native `membershipLimit` blocks acceptance), a confusing dead end.

- **Count-then-insert race accepted.** Two concurrent creates can overshoot a cap by one. Rejected
  D1 transaction / unique-index tricks: D1 has no interactive transactions inside better-auth hooks,
  the cap is soft in practice, and overshooting by one is harmless. Also: the accept path evaluates
  native `membershipLimit` before `beforeAcceptInvitation` runs, so the member-limit error wins when
  both caps are hit at once.
