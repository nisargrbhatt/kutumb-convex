# Context — Kutumb domain glossary

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

## Userless Profile

A Community Profile with no linked Org Member. Created by another member (e.g. to record a relative
who has no account). Starts `draft`, becomes `active` once an owner/admin approves it. Because no
user "owns" it, owner/admin act on its behalf — including managing its relations.

## Relation

A directional link between two Community Profiles: `from → to`, carrying a `type` (e.g. `father`,
`wife`, `brother`). **The type is stated relative to the `from` profile**:
`from=A, to=B, type=father` reads "B is A's father".

- **Outgoing relation** (of a profile P) — a relation where P is the `from`. The type describes the
  counterpart's role to P. P "owns" these.
- **Incoming relation** (of a profile P) — a relation where P is the `to`. The type describes P's
  role to the counterpart; it is **not** inverted for display.

A relation is unique across a pair regardless of direction (no duplicate A–B / B–A).

## Manage Relations

The owner/admin capability to add/remove a Userless (and `active`) Community Profile's outgoing
relations on its behalf. Distinct from a user editing their own relations on their own profile.
