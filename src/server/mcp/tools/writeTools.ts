import type { CallToolResult, McpServer, ServerContext } from "@modelcontextprotocol/server";
import { and, eq } from "drizzle-orm";
import { communityProfile } from "@/db/app-schema";
import { listCustomFieldDefinitions } from "@/domain/customFieldDefinitions";
import { AppError } from "@/domain/errors";
import {
	addAddressInput,
	addRelationInput,
	addressKey,
	addressToInput,
	createProfileInput,
	createProfileToInput,
	patchAddressToInput,
	patchProfileToInput,
	removeAddressInput,
	removeRelationInput,
	updateAddressInput,
	updateProfileInput,
} from "@/domain/mcpWriteInput";
import type { QueryDb } from "@/domain/queries/db";
import { findDuplicateCandidates } from "@/domain/queries/duplicates";
import { readRules } from "@/domain/queries/profiles";
import {
	findOutgoingRelation,
	findProfileAddress,
	findRelationById,
	listProfileAddresses,
} from "@/domain/queries/writeLookups";
import type { Actor } from "@/domain/permission";
import { captureMcpToolCalled } from "@/lib/posthog-server";
import { getActor } from "../actor";
import { toolErrorResult } from "../errors";
import { writeDenied } from "../write";
import { defineWriteTool } from "./define";
import { toWriteResult, writeResultOutput, type WriteResult } from "./writeResult";
import { beginWrite, type WriteDeps } from "./writeSupport";

/** Every write tool, registered or not: a call to one of these never reads as "Tool not found". */
const TOOL = {
	createProfile: "create_profile",
	updateProfile: "update_profile",
	addRelation: "add_relation",
	removeRelation: "remove_relation",
	addAddress: "add_address",
	updateAddress: "update_address",
	removeAddress: "remove_address",
} as const;
export const WRITE_TOOL_NAMES: ReadonlySet<string> = new Set(Object.values(TOOL));

export const createProfileDescription = `Creates a Community Profile for a person in this community (use self: true only for the signed-in member's own profile, when whoami.profileId is null).

ALWAYS call search_profiles first to check the person is not already there. If a profile with the same first + last name exists (and the dates of birth do not differ) nothing is written and you get outcome "possible_duplicate" with candidates: ask the user whether it is the same person; only if they say it is someone else, call again with allowDuplicate: true.

firstName and lastName are required. Dates are YYYY-MM-DD. customFields is a list of {field, value}: field is an id or exact label from list_custom_fields; value must match the field's type (text string, number, boolean, YYYY-MM-DD for date). You cannot add addresses or relations here: use add_address / add_relation after.

Outcome "applied" = live now (owner/admin, or self). Outcome "requested" = submitted for owner/admin review and NOT live until approved; tell the user that. The new profile is visible to you meanwhile.`;

export const updateProfileDescription = `Changes fields of an existing Community Profile. Only the fields you pass change; null clears an optional field (firstName and lastName cannot be cleared). Dates are YYYY-MM-DD. customFields is a patch of {field, value} (id or exact label from list_custom_fields; value must match the field's type; null clears that value); other custom fields stay as they are.

expectedVersion is required: pass the profile's current \`version\` from get_profile. If the profile changed since, the call fails with Stale: call get_profile again and retry with the new version. Repeating a change that is already in place returns outcome "unchanged".

Outcome "applied" = live now (returns the new version). Outcome "requested" = submitted for owner/admin review and NOT live until approved (members changing someone else's profile); tell the user that. A profile linked to another member can only be changed by that member.`;

const requestedNote = `Outcome "applied" = live now. Outcome "requested" = submitted for owner/admin review and NOT live until approved (members changing a profile that is not their own); tell the user that. A profile linked to another member can only be changed by that member. Repeating a request that is already pending returns outcome "unchanged" with its changeRequestId.`;

export const addRelationDescription = `Adds a relation between two existing Community Profiles. It reads "toId is profileId's <type>" and is stored as an OUTGOING relation of profileId; it is never inverted and no reverse relation is created.

Worked example: profileId = Jared, toId = Anna, type = "sister" records that Anna is Jared's sister (get_profile on Jared shows it under outgoing). To record the same fact from Anna's side, call with profileId = Anna, toId = Jared, type = "brother": but do only one of the two, a pair of profiles can hold one relation. If one already exists with another type the call fails with Invalid and names the relation: use remove_relation on the subject that owns it (outgoing), then add the right one.

toId must be an active profile. bloodRelation defaults to false. Repeating an existing relation (same profileId, toId and type) returns outcome "unchanged" with the existing relationId.

${requestedNote}`;

export const removeRelationDescription = `Removes one OUTGOING relation of a profile (get_profile: outgoing[].id). A relation shown under incoming belongs to the other profile: pass that profile's id as profileId with the same relationId (the error tells you which).

${requestedNote}`;

export const addAddressDescription = `Adds an address to a Community Profile. line1, city, state, country and postalCode are required; line2, type (home, work, other), note and digipin are optional.

Repeating an address the profile already has (same line1, city and postalCode, ignoring case and extra spaces) returns outcome "unchanged" with the existing addressId and version; use update_address to change one.

${requestedNote}`;

export const updateAddressDescription = `Changes fields of an existing address. Only the fields you pass change; null clears line2, type, note or digipin (line1, city, state, country and postalCode cannot be cleared).

expectedVersion is required: pass the address's \`version\` from get_profile. If it changed since, the call fails with Stale: call get_profile again and retry with the new version. Repeating a change that is already in place returns outcome "unchanged".

${requestedNote}`;

export const removeAddressDescription = `Removes one address from a Community Profile (get_profile: addresses[].id). This cannot be undone through this server.

${requestedNote}`;

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
 * Connection never sees them in `tools/list`. Every tool follows one pattern: `beginWrite`
 * (burst + daily quota + per-Connection seam) → edge checks / merge → seam `submit` →
 * `toWriteResult`.
 */
export function registerWriteTools(server: McpServer, deps: WriteDeps): void {
	defineWriteTool(
		server,
		TOOL.createProfile,
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
		TOOL.updateProfile,
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

	defineWriteTool(
		server,
		TOOL.addRelation,
		{
			title: "Add relation",
			description: addRelationDescription,
			inputSchema: addRelationInput,
			outputSchema: writeResultOutput,
			destructive: false,
			idempotent: false,
		},
		async (actor, input, call): Promise<WriteResult> => {
			const { changes } = await beginWrite(deps, actor, call);
			const { profileId, toId, type, bloodRelation, note } = input;
			await loadReadableProfile(deps.db, actor, profileId);
			const existing =
				toId === profileId
					? undefined
					: await findOutgoingRelation(deps.db, actor.organizationId, profileId, toId);
			if (existing?.type === type) {
				return {
					outcome: "unchanged",
					profileId,
					relationId: existing.id,
					message: "No change: this relation already exists.",
				};
			}
			if (existing) {
				throw new AppError(
					"Invalid",
					`These profiles already have a relation: toId is profileId's ${existing.type} (relationId ${existing.id}). A pair holds only one relation. To change it, call remove_relation with this relationId, then add_relation with the right type.`
				);
			}
			const res = await changes.submit(actor, {
				kind: "relation_add",
				profileId,
				toId,
				type,
				bloodRelation: bloodRelation ?? false,
				note: note?.trim() || null,
			});
			return toWriteResult(res, {
				applied: "Relation added and live.",
				unchanged: "Nothing to do.",
			});
		}
	);

	defineWriteTool(
		server,
		TOOL.removeRelation,
		{
			title: "Remove relation",
			description: removeRelationDescription,
			inputSchema: removeRelationInput,
			outputSchema: writeResultOutput,
			destructive: true,
			idempotent: true,
		},
		async (actor, input, call): Promise<WriteResult> => {
			const { changes } = await beginWrite(deps, actor, call);
			const { profileId, relationId } = input;
			await loadReadableProfile(deps.db, actor, profileId);
			const rel = await findRelationById(deps.db, actor.organizationId, relationId);
			if (rel && rel.toId === profileId && rel.fromId !== profileId) {
				const owner = await loadReadableProfile(deps.db, actor, rel.fromId ?? "").then(
					(p) => p.id,
					() => null
				);
				throw new AppError(
					"Invalid",
					owner
						? `Relation ${relationId} is an incoming relation of profile ${profileId}: it is the outgoing relation of profile ${owner}, and only outgoing relations can be removed from their own profile. Call remove_relation with profileId "${owner}" and the same relationId.`
						: `Relation ${relationId} is an incoming relation of profile ${profileId}; only outgoing relations can be removed, from the profile that owns them.`
				);
			}
			const res = await changes.submit(actor, { kind: "relation_remove", profileId, relationId });
			return toWriteResult(res, {
				applied: "Relation removed.",
				unchanged: "Nothing to do.",
			});
		}
	);

	defineWriteTool(
		server,
		TOOL.addAddress,
		{
			title: "Add address",
			description: addAddressDescription,
			inputSchema: addAddressInput,
			outputSchema: writeResultOutput,
			destructive: false,
			idempotent: false,
		},
		async (actor, input, call): Promise<WriteResult> => {
			const { changes } = await beginWrite(deps, actor, call);
			const { profileId, ...fields } = input;
			await loadReadableProfile(deps.db, actor, profileId);
			const address = addressToInput(fields);
			const key = addressKey(address);
			const existing = (await listProfileAddresses(deps.db, profileId)).find(
				(a) => addressKey(a) === key
			);
			if (existing) {
				return {
					outcome: "unchanged",
					profileId,
					addressId: existing.id,
					version: existing.version,
					message:
						"No change: the profile already has this address. Use update_address to change it.",
				};
			}
			const res = await changes.submit(actor, { kind: "address_add", profileId, address });
			return toWriteResult(res, {
				applied: "Address added and live.",
				unchanged: "Nothing to do.",
			});
		}
	);

	defineWriteTool(
		server,
		TOOL.updateAddress,
		{
			title: "Update address",
			description: updateAddressDescription,
			inputSchema: updateAddressInput,
			outputSchema: writeResultOutput,
			destructive: true,
			idempotent: true,
		},
		async (actor, input, call): Promise<WriteResult> => {
			const { changes } = await beginWrite(deps, actor, call);
			const { profileId, addressId, expectedVersion, ...patch } = input;
			await loadReadableProfile(deps.db, actor, profileId);
			const current = await findProfileAddress(deps.db, profileId, addressId);
			if (!current) throw new AppError("NotFound", "Address not found");
			const res = await changes.submit(actor, {
				kind: "address_edit",
				profileId,
				addressId,
				expectedVersion,
				address: patchAddressToInput(current, patch),
			});
			// A matching version + empty diff: nothing changed, the address is still at that version.
			const out = toWriteResult(res, {
				applied: "Address updated.",
				unchanged: "No change: the address already has these values.",
			});
			return out.outcome === "unchanged" && !out.changeRequestId
				? { ...out, addressId, version: expectedVersion }
				: out;
		}
	);

	defineWriteTool(
		server,
		TOOL.removeAddress,
		{
			title: "Remove address",
			description: removeAddressDescription,
			inputSchema: removeAddressInput,
			outputSchema: writeResultOutput,
			destructive: true,
			idempotent: true,
		},
		async (actor, input, call): Promise<WriteResult> => {
			const { changes } = await beginWrite(deps, actor, call);
			const { profileId, addressId } = input;
			await loadReadableProfile(deps.db, actor, profileId);
			const res = await changes.submit(actor, { kind: "address_remove", profileId, addressId });
			return toWriteResult(res, {
				applied: "Address removed.",
				unchanged: "Nothing to do.",
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
		const actor = getActor(ctx);
		captureMcpToolCalled({
			tool: request.params.name,
			userId: actor.userId,
			organizationId: actor.organizationId,
			clientId: ctx.http?.authInfo?.clientId ?? "unknown",
			isError: true,
		});
		return toolErrorResult(writeDenied(actor.write));
	});
}
