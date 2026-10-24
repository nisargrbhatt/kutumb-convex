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
import { searchProfilesDescription, searchProfilesOutput } from "./tools/searchProfiles";
import { registerWriteTools } from "./tools/writeTools";
import { whoami, whoamiOutput } from "./tools/whoami";
import { READ_ONLY } from "@/domain/mcpWrite";
import type { WriteAccess } from "@/domain/mcpWrite";

/**
 * Fresh per request (stateless): no sessions, no Durable Object. Write tools exist only for a
 * Connection with effective write (ADR 0006), so `tools/list` hides them otherwise.
 */
export function buildMcpServer(
	{ canWrite }: { canWrite: boolean } = { canWrite: false }
): McpServer {
	const server = new McpServer({ name: "kutumb", version: "1.0.0" });

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
