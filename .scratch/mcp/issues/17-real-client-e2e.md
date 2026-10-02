# Real-client E2E verification

Type: HITL Status: open Blocked by: 11, 14, 16

Spec: [spec.md § Testing](../spec.md)

## What to build

Run dev behind `cloudflared` tunnel, `BETTER_AUTH_URL` = tunnel host. Connect claude.ai, ChatGPT,
Claude Code, Cursor. Fix what breaks.

## Acceptance criteria

- [ ] each client: connects (CIMD where supported, else DCR), all 4 tools answer
- [ ] Claude Code loopback random port OK; Cursor `localhost:8787` vs wrangler dev port noted
- [ ] refresh rotation after 1h works; revoke cuts access immediately
- [ ] "how many sisters does X have?" answered correctly by at least one client
