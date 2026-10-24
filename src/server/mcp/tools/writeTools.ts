import type { McpServer } from "@modelcontextprotocol/server";

/**
 * Registers every write tool via `defineWriteTool`. Called by `buildMcpServer` only when the
 * Connection can effectively write (token ∩ consent ∩ org toggle, ADR 0006), so a read-only
 * Connection never sees them in `tools/list`. Slices 19-20 add the tools here.
 */
export function registerWriteTools(_server: McpServer): void {}
