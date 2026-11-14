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
someone else's behalf (see Userless Profile). `inactive` means deactivated: seen only by owner/admin
and its linked user. Other members see only `active` profiles, plus drafts they created. A profile
with a date of death is **deceased** but stays `active`: status is about visibility, not whether the
person is alive. _Avoid_: using `inactive` to mean deceased.

## Userless Profile

A Community Profile with no linked Org Member. Created by another member (e.g. to record a relative
who has no account). One created by an owner/admin is `active` at once; one created by any other
member starts `draft`, becomes `active` once an owner/admin approves it, and is removed if rejected
or withdrawn. Because no user "owns" it, owner/admin act on its behalf, and every other member's
change to it is a Change Request. _Avoid_: "orphan profile".

## Change Request

A member's proposed change to one Userless Profile, awaiting an owner/admin Review. Covers exactly
one thing: creating the profile, or one change to its info, its Profile Photo, one relation, or one
address. Changes by owner/admin apply directly instead. A profile linked to an Org Member never has
Change Requests. Ends **approved** or **rejected** by a Review, **withdrawn** by its submitter, or
**superseded** when its profile is reassigned or deleted while it is pending. Only an `active`
Userless Profile takes Change Requests beyond its creation. The member who proposes it is its
**submitter**, who may hold at most a fixed number pending at once in an organization (the **pending
request limit**). A pending Change Request is **stale** when its profile or target changed since
submission so it can no longer apply as proposed; a stale one can only be rejected or withdrawn.
_Avoid_: "suggestion", "edit request".

## Review

An owner/admin's decision on a Change Request: **approve** (the change applies) or **reject** (it
does not; a reason is required).

## Audit Event

A permanent record of one change to a Community Profile: who, what, when, which Change Request or
Review it came from, and which AI Client made it, if any (a change or Change Request made through a
Connection is **attributed** to that AI Client; the Actor is still the member). Recorded for every
profile change, linked or userless, and outlives the profile. Visible to owner/admin only. _Avoid_:
"log", "history entry".

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

## Upload limit

The maximum size of a single piece of media added to a community. A video is at most 2 minutes and
95 MB. There is no limit on the total a community or Org Member stores; only media still being added
is capped per Org Member, at 500 MB.

## Actor

The subject of any action against a community: an Org Member identified by their user, the
organization they are acting in, and their role there. Every read or write of community data is
performed by exactly one Actor. An Actor comes from a signed-in session or from a Connection; either
way the role is the Org Member's current role, not one captured earlier. _Avoid_: "current user",
"session user".

## Custom Field Definition

An organization-level declaration of an extra attribute every Community Profile in that community
may carry: a label and a type (`text | number | date | boolean`). Identified by a stable id — the
label is display text, unique within the community, and may change. _Avoid_: "custom field" alone
when the definition (not the value) is meant.

## Custom Field Value

The value one Community Profile holds for one Custom Field Definition. Keyed by the definition's id,
never by its label, so renaming a definition does not orphan values. A definition with no value on a
profile is simply absent.

## AI Client

An external LLM application (e.g. Claude, ChatGPT, an IDE assistant) that reads, and may change,
community data on an Org Member's behalf through a Connection. _Avoid_: "LLM provider",
"integration".

## Connection

An Org Member's consent letting one AI Client act as them in **one** organization, chosen at consent
time. The AI Client acts as that member's Actor with their current role. A Connection is revocable
by its member and ends when their membership in that organization ends. Connecting a second
organization means a second Connection. A Connection reads only, unless its member also granted
**write** at consent; the member can later make it **read only** without revoking it (getting write
back means reconnecting). An owner can turn off **AI Client writes** for the whole organization,
making every Connection there read-only. Each Connection has its own **write quota**. _Avoid_: "API
token", "grant", "integration".

## Profile Photo

The image identifying one Community Profile, shown as its avatar. Belongs to the profile, so one
person can have different photos in different communities. Visible to exactly those who can see the
profile. Set, replaced or removed like any other change to the profile, except that owner/admin may
also remove (but not set) the photo of a profile linked to an Org Member. Stays with the profile if
it is reassigned. A replaced or removed image is gone: history records that it changed, not what it
showed. _Avoid_: "user image", "account picture" (the auth user's image is a separate thing).

## Feed

The stream of what Org Members share within their organization, most recently posted first. Visible
only to Org Members of that organization: there is no public or cross-organization view. A link to
something on the Feed can be shared, but opening it still requires signing in as one of those Org
Members. Opening one moves that member into its organization. To anyone else it looks the same as
something that does not exist.

## Post

One entry on the Feed, of exactly one kind, fixed when it is posted. Memory is the first kind;
announcements and polls are expected later. Its author is an Org Member at the time of posting,
never a Userless Profile, and the Post outlives that membership. Any Post can be liked and commented
on, whatever its kind; media belongs to the kind, not to Post. _Avoid_: "feed item".

## Memory

A kind of Post: an Org Member's shared recollection, with a title, a formatted description and a
gallery of up to five photos and short videos, which may be empty. Any Org Member may post one, and
it is live at once: no drafts, no approval. Only its author may edit it, while still an Org Member.
Its author or an owner/admin may remove it; removal is permanent and leaves no record.

## Comment

An Org Member's plain-text response to a Post, in one flat list with no replies. It can't be edited
and can't be liked. Its author, while still an Org Member, or an owner/admin may remove it; removal
is permanent and leaves no record. It outlives its author's membership.

## Like

An Org Member's single mark of appreciation on a Post, which they can take back. Who liked a Post is
visible to its viewers. A Like outlives its author's membership. _Avoid_: "reaction".

## Subscription

An organization's paid plan: one per organization, existing from the moment the organization is
created, billed to the organization, not to a user. A user in several organizations pays for each
separately. Any owner of the organization manages it; admins and members never see it. The
organization is the **customer**, named after it, with an owner's email as its billing contact.
_Avoid_: "plan" for the organization's own Subscription, "account".

## Trial

The first 15 days of an organization's Subscription, free and with nothing to pay up front. An owner
may add payment details at any point during it; nothing is charged before it ends. Ends either in
the first charge or in a Lock. _Avoid_: "free tier".

## Lock

The state of an organization whose Trial ended with no Subscription, or whose Subscription stopped
being paid. No one can use that organization: not in the app and not through a Connection. Its data
is kept untouched, and starting or fixing the Subscription lifts the Lock at once. Members are told
to ask an owner; owners see only how to pay. _Avoid_: "suspended", "read-only".
