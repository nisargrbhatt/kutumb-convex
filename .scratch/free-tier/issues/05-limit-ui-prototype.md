# 05 — Limit UI prototype

Parent: [MAP.md](../MAP.md) Label: `wayfinder:prototype` Status: `closed` Assignee: nisargrbhatt
Blocked by: [03](03-limit-enforcement-design.md)

## Question

How should the caps look? Prototype variations for: create-org page with `n/5` + disabled state;
invitation-accept error at cap; profile-create error at cap; org-usage block in settings overview
(decided in 04: read-only, above Danger Zone, `Org Members n/1000` + `Community Profiles n/1000`).
Also settle verbatim `LIMIT_COPY` for each error (org cap on create/accept, member cap on invite
send, profile cap — incl. "ask an admin to free a slot" for self-profile). Link the prototype branch
from this ticket.

## Comments

### Resolution (2026-09-17)

Prototype: branch `prototype/limit-ui` (`f06ab66`). Files: `src/prototype/PrototypeSwitcher.tsx`,
`src/prototype/limit-copy.ts`, `onboarding/create/-components/LimitVariants.prototype.tsx`,
`settings/overview/-components/UsageVariants.prototype.tsx`.

**Winners — both variant A:**

- **Create-org page (`/onboarding/create`)**: `n/5` `Badge` (`secondary`, `destructive` at cap)
  inline in `CardTitle`; at cap a `destructive` `Alert` (Lock icon, `LIMIT_COPY.orgCreate` title +
  description) above the form and Create button `disabled`. Form stays visible.
- **Settings overview usage block**: `Card` titled "Usage", description "Free plan limits for this
  organization.", two `Progress` rows (`Org Members`, `Community Profiles`) with `ProgressLabel` +
  `ProgressValue` `n / 1000` (mono, `text-destructive` at cap, amber ≥ 90%). Sits between org form
  and Danger Zone.
- Invite-accept / invite-send / profile-create errors: sonner `toast.error(title, { description })`
  — no inline UI.
- **`LIMIT_COPY` = "actionable" set** (default shown; user didn't override):
  - `orgCreate`: "You're already in 5 organizations" / "Leave or delete one to create a new
    organization. Limit is 5 per account."
  - `orgAccept`: "Can't accept — you're already in 5 organizations" / "Leave or delete one, then
    accept this invite. Limit is 5 per account."
  - `memberInvite`: "Member limit reached" / "This organization has 1000 members or pending invites.
    Remove a member or revoke an invite to send a new one."
  - `profileAdmin`: "Profile limit reached" / "This organization already has 1000 community
    profiles. Delete a profile to add another."
  - `profileSelf`: "Profile limit reached" / "This organization already has 1000 community profiles,
    so your profile can't be created yet. Ask an admin to free a slot."
  - Numbers interpolated from `ORG_LIMIT` / `MEMBER_LIMIT`.
- Rejected: B (meter + empty state), C (slot dots / bordered table) — prototype branch is the
  primary source. Impl rewrites the winner properly; prototype slots on `OnboardingForm` not kept.
