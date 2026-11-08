# `photo` Change Request

Status: ready-for-agent Blocked by: 26

## What to build

A plain member proposes a photo for an `active` Userless Profile, and owner/admin Review it.

- `CHANGE_REQUEST_KIND.photo`, payload of base and proposed blob ids, either null. New cases in
  `staleReason`, `requestDiff`, `ChangeRequestPayload`. `FIELD_LABEL` gains `photo`.
- Same crop editor, button "Send for review". Remove is a request too.
- Approve moves the Blob's owner fields to the profile, no byte copy.
- Rejected, withdrawn, superseded delete bytes. Stale keeps them until closed.
- `ReviewDrawer`: current and proposed side by side. Closed requests show "Photo proposed", no
  thumbnail.
- Replace the `changeRequest` stub owner check from [Gate memo and
  sweep](25-gate-memo-and-sweep.md).

## Spec

[spec.md](../spec.md): Profile Photo > `photo` Change Request, Unconfirmed defaults.

## Done when

- [ ] Avatar is unchanged until approval. Proposed image reads for submitter and owner/admin only.
- [ ] Base changed since submission: stale, "Changed since requested: Photo", reject or withdraw
  only.
- [ ] Joins overlap warnings and counts toward the pending request limit.
- [ ] Approve applies with one Audit Event; old photo's bytes go.
- [ ] Reject, withdraw and supersede delete the proposed bytes; Audit keeps metadata.
- [ ] Reassign supersedes a pending `photo` request.
