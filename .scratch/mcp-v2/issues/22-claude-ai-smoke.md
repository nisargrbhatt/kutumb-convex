# claude.ai end-to-end smoke

Type: HITL Status: open Blocked by: 21

Spec: [spec.md § Testing](../spec.md)

## What to build

Deployed preview + real claude.ai Connection. Checklist:

- [ ] connect read only → no write tools; reconnect with write → write tools appear
- [ ] ask custom-field question, filtered search, count by city
- [ ] owner: create (duplicate warning first), update → applied, graph shows it next read
- [ ] member: update a userless profile → requested; visible in My requests with "via" byline
- [ ] Make read only mid-chat → next write call refused with hint
- [ ] owner toggles AI writes off → tools gone for member; back on → return
- [ ] hit burst quota (11 quick writes) → quota message
