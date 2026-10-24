# Write tool catalogue and shapes

Type: grilling Status: resolved Blocked by: 02, 04

## Question

Which write tools exist and what do they look like? Settle:

- One tool per `submit` kind or one `submit_profile_change`.
- Input shapes, including how `expectedVersion` is obtained and passed.
- Result shape: `applied` vs `pending` Change Request with id, plus `Stale`/`Conflict`/`Invalid`
  errors.
- Annotations.
- Confirmation/elicitation.
- Idempotency.
- Gating: hide tools without `community:write` vs a scope error.
- Whether the member sees the AI Client's pending requests in My requests.


## Answer

Resolved 2026-10-22 (grilling).

- **Tools**: one per `submit` kind: `create_profile`, `update_profile`, `add_relation`,
  `remove_relation`, `add_address`, `update_address`, `remove_address`. Same tools for every role;
  routing (direct vs Change Request) stays in `makeProfileChanges`.
- **Inputs**:
  - `create_profile`: `firstName`, `lastName` required; other core fields optional (null);
    `customFields?: [{field,value}]`; `self?: false` (own linked profile, when `whoami.profileId` is
    null). No nested addresses/relations. Description: `search_profiles` first to avoid duplicates.
  - `update_profile` / `update_address`: partial patch (listed fields change, `null` clears),
    `expectedVersion` required. MCP edge merges onto current row → full input → `submit`; domain
    unchanged. `customFields` keeps its `[{field,value}]` patch.
  - `add_relation`: `{profileId, toId, type, bloodRelation?: false, note?: null}`, read as "toId is
    profileId's <type>" (= `outgoing`), worked example in description. No inverse (ADR 0001).
  - `add_address`: `line1`, `city`, `state`, `country`, `postalCode` required; `line2`, `type`,
    `note`, `digipin` optional.
  - `remove_relation` (`profileId`, `relationId`, outgoing only), `remove_address` (`profileId`,
    `addressId`).
  - Core `dateOfBirth`/`dateOfDeath`: `YYYY-MM-DD` in and out on MCP (also changes `get_profile`).
- **Read handles**: `get_profile` adds `version` (profile + each address) and `id` on each
  relation; descriptions say only `outgoing` is removable from that subject.
- **Read-your-writes**: `aiClient` subject rule widens to drafts the Actor created (as the app);
  `get_profile` adds `myPendingRequests: [{id, kind, createdAt}]` (caller's own, that profile).
- **Result**: `{outcome: applied|requested|unchanged, profileId, changeRequestId?, version?,
  addressId?, relationId?, message}`. Extend `SubmitResult` with new version + created ids; omitted
  on `requested`. `message` is plain text ("Submitted for owner/admin review; not live until
  approved"). `requested` is never `isError`.
- **Errors**: `toolErrorResult` maps `Invalid`/`Stale`/`Conflict`/`LimitReached` to `isError` with
  user-safe message + static per-kind hint (Stale → re-read `get_profile`, retry with its version;
  Invalid → valid fields/enums). Others stay "Internal error".
- **Annotations**: all `readOnlyHint:false`, `openWorldHint:false`; `destructiveHint` true for
  updates + removes, false for create/adds; `idempotentHint` true for updates + removes.
- **Confirmation**: host approval prompt only. No elicitation, `dryRun`, or `user_confirmed`.
- **Idempotency** (no key param, MCP edge only): exact repeat → `unchanged` + existing id.
  `add_address` matches normalised line1+city+postalCode; `add_relation` matches toId+type (same
  pair, other type stays `Invalid`); updates already `unchanged` when equal. Create duplicates →
  guardrails ticket.
- **Gating**: write tools hidden without `community:write`; `whoami` adds `canWrite` + reconnect
  hint when false. Step-up deferred (Connection migration fog).
- **My requests**: AI-submitted Change Requests show there as the member's own (member is
  submitter); withdraw in app. Attribution badge → guardrails ticket.

Implementation fact-checks (not decisions): per-request `buildMcpServer` can read
`authInfo.scopes`; `tools/list` varies by scope → `cacheScope:"private"`.
