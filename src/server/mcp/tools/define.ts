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

type ToolConfig<Out extends z.ZodObject, In extends z.ZodObject | undefined> = {
	title: string;
	description: string;
	inputSchema?: In;
	outputSchema: Out;
};

/**
 * Registers a read-only tool that runs as the request's Actor. Maps errors to `isError` results
 * and reports `mcp_tool_called` (name, org, client, outcome, duration — never inputs/outputs).
 * With an `inputSchema` the SDK validates arguments first and `run` receives them.
 */
export function defineReadTool<
	Out extends z.ZodObject,
	In extends z.ZodObject | undefined = undefined,
>(
	server: McpServer,
	name: string,
	config: ToolConfig<Out, In>,
	run: (
		actor: Actor,
		input: In extends z.ZodObject ? z.output<In> : undefined
	) => Promise<z.input<Out>>
): void {
	server.registerTool(name, { ...config, annotations: { readOnlyHint: true } }, (async (
		...cbArgs: [ServerContext] | [unknown, ServerContext]
	): Promise<CallToolResult> => {
		const startedAt = Date.now();
		const ctx = cbArgs[cbArgs.length - 1] as ServerContext;
		const actor = getActor(ctx);
		let result: CallToolResult;
		try {
			const input = (config.inputSchema ? cbArgs[0] : undefined) as never;
			result = toolResult((await run(actor, input)) as Record<string, unknown>);
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
