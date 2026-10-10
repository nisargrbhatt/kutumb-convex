# Kutumb

A glossary of the ubiquitous language. Definitions only — no implementation detail.

## Member

Overloaded — disambiguate by context:

- **Org Member** — an authenticated user belonging to an organization, carrying a role
  (`owner | admin | member`). Sourced from the auth/organization plugin.
- **Community Profile** — a person record within a community. The "members" list and the member
  detail page operate on Community Profiles, **not** Org Members. A Community Profile may or may not
  be linked to an Org Member.

When unqualified "member" is unavoidable, it means **Community Profile** in the community-facing UI.

## Community Profile

A person in a community. Has a `status` (`draft | active | inactive`) and an optional link to an Org
Member (the linked user). Created either by a user describing themselves, or by another member on
someone else's behalf (see Userless Profile).
`inactive` means deactivated: seen only by owner/admin and its linked user. Other members see
only `active` profiles, plus drafts they created.

## Userless Profile

A Community Profile with no linked Org Member. Created by another member (e.g. to record a relative
who has no account). One created by an owner/admin is `active` at once; one created by any other
member starts `draft`, becomes `active` once an owner/admin approves it, and is removed if rejected
or withdrawn. Because no user "owns" it, owner/admin act on its behalf, and every other
member's change to it is a Change Request. _Avoid_: "orphan profile".

## Change Request

A member's proposed change to one Userless Profile, awaiting an owner/admin Review. Covers exactly
one thing: creating the profile, or one change to its info, one relation, or one address. Changes by
owner/admin apply directly instead. A profile linked to an Org Member never has Change Requests.
Ends **approved** or **rejected** by a Review, **withdrawn** by its submitter, or **superseded**
when its profile is reassigned or deleted while it is pending. Only an `active` Userless Profile
takes Change Requests beyond its creation. The member who proposes it is its **submitter**. A
pending Change Request is **stale** when its profile or target changed since submission so it can no
longer apply as proposed; a stale one can only be rejected or withdrawn.
_Avoid_: "suggestion", "edit request".

## Review

An owner/admin's decision on a Change Request: **approve** (the change applies) or **reject** (it
does not; a reason is required).

## Audit Event

A permanent record of one change to a Community Profile: who, what, when, and which Change Request
or Review it came from. Recorded for every profile change, linked or userless, and outlives the
profile. Visible to owner/admin only. _Avoid_: "log", "history entry".

## Relation

A directional link between two Community Profiles: `from → to`, carrying a `type` (e.g. `father`,
`wife`, `brother`). **The type is stated relative to the `from` profile**:
`from=A, to=B, type=father` reads "B is A's father".

- **Outgoing relation** (of a profile P) — a relation where P is the `from`. The type describes the
  counterpart's role to P. P "owns" these.
- **Incoming relation** (of a profile P) — a relation where P is the `to`. The type describes P's
  role to the counterpart; it is **not** inverted for display.

A relation is unique across a pair regardless of direction (no duplicate A–B / B–A).

## Organization limit

The maximum number of organizations a single user may belong to at once, counted across **all
roles** (owner, admin, member). Fixed at 5. Reaching it blocks creating a new organization and
accepting an invitation; leaving or losing an organization frees a slot immediately.

## Member limit

The maximum size of one organization. Fixed at 1000, applied separately to **Org Members** (any
role, with a **pending invitation reserving a slot**) and to **Community Profiles** (any status,
linked or userless). Reaching it blocks inviting a new Org Member or creating a new Community
Profile respectively. There is no exemption for an Org Member creating their own Community Profile.

## Actor

The subject of any action against a community: an Org Member identified by their user, the
organization they are acting in, and their role there. Every read or write of community data is
performed by exactly one Actor. An Actor comes from a signed-in session or from a Connection; either
way the role is the Org Member's current role, not one captured earlier. _Avoid_: "current user",
"session user".

## Custom Field Definition

An organization-level declaration of an extra attribute every Community Profile in that community
may carry: a label and a type (`text | number | date | boolean`). Identified by a stable id — the
label is display text and may change. _Avoid_: "custom field" alone when the definition (not the
value) is meant.

## Custom Field Value

The value one Community Profile holds for one Custom Field Definition. Keyed by the definition's id,
never by its label, so renaming a definition does not orphan values. A definition with no value on a
profile is simply absent.

## AI Client

An external LLM application (e.g. Claude, ChatGPT, an IDE assistant) that reads community data on an
Org Member's behalf through a Connection. _Avoid_: "LLM provider", "integration".

## Connection

An Org Member's consent letting one AI Client act as them in **one** organization, chosen at consent
time. The AI Client acts as that member's Actor with their current role. A Connection is revocable
by its member and ends when their membership in that organization ends. Connecting a second
organization means a second Connection. _Avoid_: "API token", "grant", "integration".
