import type { CallToolResult, McpServer, ServerContext } from "@modelcontextprotocol/server";
import { and, eq } from "drizzle-orm";
import { communityProfile } from "@/db/app-schema";
import { listCustomFieldDefinitions } from "@/domain/customFieldDefinitions";
import { AppError } from "@/domain/errors";
import { WRITE_DENIED_MESSAGE } from "@/domain/mcpWrite";
import {
	createProfileInput,
	createProfileToInput,
	patchProfileToInput,
	updateProfileInput,
} from "@/domain/mcpWriteInput";
import type { QueryDb } from "@/domain/queries/db";
import { findDuplicateCandidates } from "@/domain/queries/duplicates";
import { readRules } from "@/domain/queries/profiles";
import type { Actor } from "@/domain/permission";
import { captureMcpToolCalled } from "@/lib/posthog-server";
import { getActor } from "../actor";
import { toolErrorResult } from "../errors";
import { defineWriteTool } from "./define";
import { toWriteResult, writeResultOutput, type WriteResult } from "./writeResult";
import { beginWrite, type WriteDeps } from "./writeSupport";

/** Every write tool, registered or not: a call to one of these never reads as "Tool not found". */
export const WRITE_TOOL_NAMES: ReadonlySet<string> = new Set([
	"create_profile",
	"update_profile",
	"add_relation",
	"remove_relation",
	"add_address",
	"update_address",
	"remove_address",
]);

export const createProfileDescription = `Creates a Community Profile for a person in this community (use self: true only for the signed-in member's own profile, when whoami.profileId is null).

ALWAYS call search_profiles first to check the person is not already there. If a profile with the same first + last name exists (and the dates of birth do not differ) nothing is written and you get outcome "possible_duplicate" with candidates: ask the user whether it is the same person; only if they say it is someone else, call again with allowDuplicate: true.

firstName and lastName are required. Dates are YYYY-MM-DD. customFields is a list of {field, value}: field is an id or exact label from list_custom_fields; value must match the field's type (text string, number, boolean, YYYY-MM-DD for date). You cannot add addresses or relations here: use add_address / add_relation after.

Outcome "applied" = live now (owner/admin, or self). Outcome "requested" = submitted for owner/admin review and NOT live until approved; tell the user that. The new profile is visible to you meanwhile.`;

export const updateProfileDescription = `Changes fields of an existing Community Profile. Only the fields you pass change; null clears an optional field (firstName and lastName cannot be cleared). Dates are YYYY-MM-DD. customFields is a patch of {field, value} (id or exact label from list_custom_fields; value must match the field's type; null clears that value); other custom fields stay as they are.

expectedVersion is required: pass the profile's current \`version\` from get_profile. If the profile changed since, the call fails with Stale: call get_profile again and retry with the new version. Repeating a change that is already in place returns outcome "unchanged".

Outcome "applied" = live now (returns the new version). Outcome "requested" = submitted for owner/admin review and NOT live until approved (members changing someone else's profile); tell the user that. A profile linked to another member can only be changed by that member.`;

/** The AI client's view of one profile row (`readRules`), or `NotFound`. */
async function loadReadableProfile(db: QueryDb, actor: Actor, id: string) {
	const { subjectWhere } = readRules(actor, "aiClient");
	const row = await db.query.communityProfile.findFirst({
		where: () => and(eq(communityProfile.id, id), subjectWhere)!,
	});
	if (!row) throw new AppError("NotFound", "Community Profile not found");
	return row;
}

/**
 * Registers every write tool via `defineWriteTool`. Called by `buildMcpServer` only when the
 * Connection can effectively write (token ∩ consent ∩ org toggle, ADR 0006), so a read-only
 * Connection never sees them in `tools/list`. Slice 20 adds the relation/address tools here, on
 * the same pattern: `beginWrite` (burst + daily quota + per-Connection seam) → seam `submit` →
 * `toWriteResult`.
 */
export function registerWriteTools(server: McpServer, deps: WriteDeps): void {
	defineWriteTool(
		server,
		"create_profile",
		{
			title: "Create profile",
			description: createProfileDescription,
			inputSchema: createProfileInput,
			outputSchema: writeResultOutput,
			destructive: false,
			idempotent: false,
		},
		async (actor, input, call): Promise<WriteResult> => {
			const { changes } = await beginWrite(deps, actor, call, { create: true });
			const defs = await listCustomFieldDefinitions(deps.db, actor.organizationId);
			const profile = createProfileToInput(input, defs);
			if (!input.allowDuplicate) {
				const candidates = await findDuplicateCandidates(deps.db, actor, profile);
				if (candidates.length > 0) {
					return {
						outcome: "possible_duplicate",
						candidates,
						message:
							"Nothing was created: a profile with this name already exists. Ask the user whether it is the same person. If it is a different person, call create_profile again with allowDuplicate: true.",
					};
				}
			}
			const res = await changes.submit(actor, {
				kind: "create",
				self: input.self === true,
				profile,
			});
			return toWriteResult(res, {
				applied: "Profile created and live.",
				unchanged: "Nothing to do.",
			});
		}
	);

	defineWriteTool(
		server,
		"update_profile",
		{
			title: "Update profile",
			description: updateProfileDescription,
			inputSchema: updateProfileInput,
			outputSchema: writeResultOutput,
			destructive: true,
			idempotent: true,
		},
		async (actor, input, call): Promise<WriteResult> => {
			const { changes } = await beginWrite(deps, actor, call);
			const { profileId, expectedVersion, ...patch } = input;
			const [current, defs] = await Promise.all([
				loadReadableProfile(deps.db, actor, profileId),
				listCustomFieldDefinitions(deps.db, actor.organizationId),
			]);
			const res = await changes.submit(actor, {
				kind: "info",
				profileId,
				expectedVersion,
				profile: patchProfileToInput(current, patch, defs),
			});
			return toWriteResult(res, {
				applied: "Profile updated.",
				unchanged: "No change: the profile already has these values.",
			});
		}
	);
}

type CallHandler = (
	request: { params: { name: string } },
	ctx: ServerContext
) => Promise<CallToolResult>;

/**
 * For a Connection without effective write the tools are not registered (hidden from
 * `tools/list`), so a stale `tools/call` would hit the SDK's protocol-level "Tool not found".
 * Spec: answer a known write tool name with an `isError` `WriteNotAllowed` carrying the reason +
 * hint instead. Wraps the SDK's `tools/call` handler (read it back through the protected
 * accessor; the SDK has no public hook), so call this after the read tools are registered.
 */
export function denyStaleWriteCalls(server: McpServer): void {
	const low = server.server as unknown as {
		_getRequestHandler(method: string): CallHandler | undefined;
	};
	const inner = low._getRequestHandler("tools/call");
	if (!inner) throw new Error("denyStaleWriteCalls: register the read tools first");

	server.server.removeRequestHandler("tools/call");
	server.server.setRequestHandler("tools/call", async (request, ctx) => {
		if (!WRITE_TOOL_NAMES.has(request.params.name)) return inner(request, ctx);
		const startedAt = Date.now();
		const actor = getActor(ctx);
		const reason = actor.write.canWrite ? "connection_read_only" : actor.write.reason;
		captureMcpToolCalled({
			tool: request.params.name,
			userId: actor.userId,
			organizationId: actor.organizationId,
			clientId: ctx.http?.authInfo?.clientId ?? "unknown",
			isError: true,
			durationMs: Date.now() - startedAt,
		});
		return toolErrorResult(new AppError("WriteNotAllowed", WRITE_DENIED_MESSAGE[reason], reason));
	});
}
