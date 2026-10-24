# Relation + address write tools

Type: AFK Status: open Blocked by: 19

Spec: [spec.md § Write tools](../spec.md)

## What to build

- `add_relation` (outgoing, worked example in description, idempotent on toId+type, other type for
  same pair → `Invalid`), `remove_relation` (outgoing only).
- `add_address` (idempotent on normalised line1+city+postalCode), `update_address` (patch +
  `expectedVersion`), `remove_address`.
- Annotations, quotas, `via`, result ids as in 19.

## Acceptance criteria

- [ ] tool tests per tool × role routing (applied / requested)
- [ ] idempotent repeats → `unchanged` + existing id
- [ ] incoming relation id on `remove_relation` → `Invalid` hint
