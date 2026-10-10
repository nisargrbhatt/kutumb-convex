-- Pre-seed prod MCP resource so oauth-provider's per-isolate seedResources() finds it and never
-- races concurrent inserts on cold start. Mirrors buildSeedRow(); other envs still seed at runtime.
INSERT OR IGNORE INTO `oauth_resource` (`id`, `identifier`, `name`, `dpop_bound_access_tokens_required`, `disabled`, `policy_version`)
VALUES (lower(hex(randomblob(16))), 'https://kutumb.nisargbhatt.org/api/mcp', 'https://kutumb.nisargbhatt.org/api/mcp', 0, 0, 1);
