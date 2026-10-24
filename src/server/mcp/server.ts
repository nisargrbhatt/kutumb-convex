import { z } from "zod";
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { db } from "@/db";
import { searchProfilesInput } from "@/domain/communityProfile";
import { searchProfiles } from "@/domain/queries/profiles";
import { defineReadTool } from "./tools/define";
import {
	getFamilyGraph,
	getFamilyGraphDescription,
	getFamilyGraphInput,
	getFamilyGraphOutput,
} from "./tools/getFamilyGraph";
import { getProfile, getProfileDescription, getProfileOutput } from "./tools/getProfile";
import {
	listCustomFields,
	listCustomFieldsDescription,
	listCustomFieldsOutput,
} from "./tools/listCustomFields";
import { searchProfilesDescription, searchProfilesOutput } from "./tools/searchProfiles";
import { whoami, whoamiOutput } from "./tools/whoami";

/** Sent on `initialize`; the model reads it before any tool call. */
export const MCP_INSTRUCTIONS = `Kutumb community directory. Before using custom fields, call whoami or list_custom_fields once: they list this community's custom fields as {id, label, type}. Refer to a field by id or exact label. Dates are YYYY-MM-DD.`;

/** Fresh per request (stateless): no sessions, no Durable Object. */
export function buildMcpServer(): McpServer {
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
		(actor, input) => getFamilyGraph(db, actor, input)
	);

	return server;
}

export const createKutumbMcpHandler = () =>
	createMcpHandler(() => buildMcpServer(), {
		legacy: "stateless",
		onerror: (error) => console.error("MCP handler error", error),
	});
