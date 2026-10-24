import type { CallToolResult, McpServer, ServerContext } from "@modelcontextprotocol/server";
import type { z } from "zod";
import { captureMcpToolCalled } from "@/lib/posthog-server";
import { getActor, type ConnectionActor } from "../actor";
import { toolErrorResult } from "../errors";
import { requireWrite } from "../write";

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

type ToolRun<Out extends z.ZodObject, In extends z.ZodObject | undefined> = (
	actor: ConnectionActor,
	input: In extends z.ZodObject ? z.output<In> : undefined
) => Promise<z.input<Out>>;

/**
 * Wraps a tool body: resolves the Actor, maps errors to `isError` results and reports
 * `mcp_tool_called` (name, org, client, outcome, duration — never inputs/outputs).
 * With an `inputSchema` the SDK validates arguments first and `run` receives them.
 */
function wrapTool<Out extends z.ZodObject, In extends z.ZodObject | undefined>(
	name: string,
	hasInput: boolean,
	run: ToolRun<Out, In>,
	{ write }: { write: boolean }
) {
	return async (...cbArgs: [ServerContext] | [unknown, ServerContext]): Promise<CallToolResult> => {
		const startedAt = Date.now();
		const ctx = cbArgs[cbArgs.length - 1] as ServerContext;
		const actor = getActor(ctx);
		let result: CallToolResult;
		let outcome: string | undefined;
		try {
			if (write) requireWrite(actor);
			const input = (hasInput ? cbArgs[0] : undefined) as never;
			const output = (await run(actor, input)) as Record<string, unknown>;
			if (write && typeof output.outcome === "string") outcome = output.outcome;
			result = toolResult(output);
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
			...(outcome ? { outcome } : {}),
		});
		return result;
	};
}

/** Registers a read-only tool that runs as the request's Actor. */
export function defineReadTool<
	Out extends z.ZodObject,
	In extends z.ZodObject | undefined = undefined,
>(server: McpServer, name: string, config: ToolConfig<Out, In>, run: ToolRun<Out, In>): void {
	server.registerTool(
		name,
		{ ...config, annotations: { readOnlyHint: true } },
		wrapTool(name, !!config.inputSchema, run, { write: false }) as never
	);
}

/**
 * Registers a write tool. Only register it when the Connection can effectively write (see
 * `registerWriteTools`); `requireWrite` still guards the call itself. Annotations per spec:
 * never read-only, never open-world; `destructive` = updates + removes, `idempotent` likewise.
 * A result's string `outcome` (applied | requested | unchanged | possible_duplicate) is reported
 * on `mcp_tool_called`.
 */
export function defineWriteTool<
	Out extends z.ZodObject,
	In extends z.ZodObject | undefined = undefined,
>(
	server: McpServer,
	name: string,
	config: ToolConfig<Out, In> & { destructive: boolean; idempotent: boolean },
	run: ToolRun<Out, In>
): void {
	const { destructive, idempotent, ...rest } = config;
	server.registerTool(
		name,
		{
			...rest,
			annotations: {
				readOnlyHint: false,
				openWorldHint: false,
				destructiveHint: destructive,
				idempotentHint: idempotent,
			},
		},
		wrapTool(name, !!config.inputSchema, run, { write: true }) as never
	);
}
