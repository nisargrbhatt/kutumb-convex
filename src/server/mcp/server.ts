import { z } from "zod";
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { db } from "@/db";
import { searchProfilesInput } from "@/domain/communityProfile";
import { searchProfiles } from "@/domain/queries/profiles";
import { defineReadTool } from "./tools/define";
import { getProfile, getProfileDescription, getProfileOutput } from "./tools/getProfile";
import { searchProfilesDescription, searchProfilesOutput } from "./tools/searchProfiles";
import { whoami, whoamiOutput } from "./tools/whoami";

/** Fresh per request (stateless): no sessions, no Durable Object. */
export function buildMcpServer(): McpServer {
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

	return server;
}

export const createKutumbMcpHandler = () =>
	createMcpHandler(() => buildMcpServer(), {
		legacy: "stateless",
		onerror: (error) => console.error("MCP handler error", error),
	});
