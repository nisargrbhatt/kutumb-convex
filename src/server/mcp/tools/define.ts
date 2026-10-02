import type { CallToolResult, McpServer, ServerContext } from "@modelcontextprotocol/server";
import type { z } from "zod";
import type { Actor } from "@/domain/permission";
import { captureMcpToolCalled } from "@/lib/posthog-server";
import { getActor } from "../actor";
import { toolErrorResult } from "../errors";

/** `structuredContent` + a JSON `text` fallback for clients that ignore structured output. */
const toolResult = (output: Record<string, unknown>): CallToolResult => ({
	content: [{ type: "text", text: JSON.stringify(output) }],
	structuredContent: output,
});

/**
 * Registers a read-only, input-less tool that runs as the request's Actor. Maps errors to
 * `isError` results and reports `mcp_tool_called` (name, org, client, outcome, duration — never
 * inputs/outputs).
 */
export function defineReadTool<Out extends z.ZodObject>(
	server: McpServer,
	name: string,
	config: { title: string; description: string; outputSchema: Out },
	run: (actor: Actor) => Promise<z.input<Out>>
): void {
	server.registerTool(name, { ...config, annotations: { readOnlyHint: true } }, (async (
		ctx: ServerContext
	): Promise<CallToolResult> => {
		const startedAt = Date.now();
		const actor = getActor(ctx);
		let result: CallToolResult;
		try {
			result = toolResult((await run(actor)) as Record<string, unknown>);
		} catch (error) {
			result = toolErrorResult(error);
		}
		captureMcpToolCalled({
			tool: name,
			userId: actor.userId,
			organizationId: actor.organizationId,
			clientId: ctx.http?.authInfo?.clientId ?? "unknown",
			isError: result.isError === true,
			durationMs: Date.now() - startedAt,
		});
		return result;
	}) as never);
}
