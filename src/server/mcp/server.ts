import { z } from "zod";
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { db } from "@/db";
import { countProfilesInput, searchProfilesInput } from "@/domain/communityProfile";
import { countProfiles } from "@/domain/queries/profileAggregates";
import { searchProfiles } from "@/domain/queries/profiles";
import { getOrgGraph } from "@/lib/graph";
import { defineReadTool } from "./tools/define";
import {
	getFamilyGraph,
	getFamilyGraphDescription,
	getFamilyGraphInput,
	getFamilyGraphOutput,
} from "./tools/getFamilyGraph";
import { countProfilesDescription, countProfilesOutput } from "./tools/countProfiles";
import { getProfile, getProfileDescription, getProfileOutput } from "./tools/getProfile";
import {
	listCustomFields,
	listCustomFieldsDescription,
	listCustomFieldsOutput,
} from "./tools/listCustomFields";
import { searchProfilesDescription, searchProfilesOutput } from "./tools/searchProfiles";
import { registerWriteTools } from "./tools/writeTools";
import { whoami, whoamiOutput } from "./tools/whoami";
import { READ_ONLY } from "@/domain/mcpWrite";
import type { WriteAccess } from "@/domain/mcpWrite";

/** Sent on `initialize`; the model reads it before any tool call. */
export const MCP_INSTRUCTIONS = `Kutumb community directory. Before using custom fields, call whoami or list_custom_fields once: they list this community's custom fields as {id, label, type}. Refer to a field by id or exact label. Dates are YYYY-MM-DD.`;

/**
 * Fresh per request (stateless): no sessions, no Durable Object. Write tools exist only for a
 * Connection with effective write (ADR 0006), so `tools/list` hides them otherwise.
 */
export function buildMcpServer(
	{ canWrite }: { canWrite: boolean } = { canWrite: false }
): McpServer {
	const server = new McpServer(
		{ name: "kutumb", version: "1.0.0" },
		{ instructions: MCP_INSTRUCTIONS }
	);

	defineReadTool(
		server,
		"whoami",
		{
			title: "Who am I",
			description:
				"Returns the signed-in member, the community (organization) this connection is scoped to, and their role there.",
			outputSchema: whoamiOutput,
		},
		(actor) => whoami(actor)
	);

	defineReadTool(
		server,
		"list_custom_fields",
		{
			title: "List custom fields",
			description: listCustomFieldsDescription,
			outputSchema: listCustomFieldsOutput,
		},
		(actor) => listCustomFields(db, actor)
	);

	defineReadTool(
		server,
		"search_profiles",
		{
			title: "Search profiles",
			description: searchProfilesDescription,
			inputSchema: searchProfilesInput,
			outputSchema: searchProfilesOutput,
		},
		(actor, input) => searchProfiles(db, actor, input)
	);

	defineReadTool(
		server,
		"count_profiles",
		{
			title: "Count profiles",
			description: countProfilesDescription,
			inputSchema: countProfilesInput,
			outputSchema: countProfilesOutput,
		},
		(actor, input) => countProfiles(db, actor, input)
	);

	defineReadTool(
		server,
		"get_profile",
		{
			title: "Get profile",
			description: getProfileDescription,
			inputSchema: z.object({ id: z.string().min(1).describe("Community Profile id") }),
			outputSchema: getProfileOutput,
		},
		(actor, input) => getProfile(db, actor, input)
	);

	defineReadTool(
		server,
		"get_family_graph",
		{
			title: "Get family graph",
			description: getFamilyGraphDescription,
			inputSchema: getFamilyGraphInput,
			outputSchema: getFamilyGraphOutput,
		},
		(actor, input) => getFamilyGraph(db, actor, input, getOrgGraph)
	);

	if (canWrite) registerWriteTools(server);

	return server;
}

/** Effective write of the Actor verified for this request (default-deny when absent). */
const writeAccessOf = (authInfo: { extra?: Record<string, unknown> } | undefined): WriteAccess =>
	(authInfo?.extra?.actor as { write?: WriteAccess } | undefined)?.write ?? READ_ONLY;

export const createKutumbMcpHandler = () =>
	createMcpHandler((ctx) => buildMcpServer({ canWrite: writeAccessOf(ctx.authInfo).canWrite }), {
		legacy: "stateless",
		onerror: (error) => console.error("MCP handler error", error),
	});
