import { and, eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { ServerContext } from "@modelcontextprotocol/server";
import { member, oauthConsent, orgSetting } from "@/db/schema";
import { parseRole } from "@/domain/mcpEndpoint";
import { READ_ONLY, resolveWriteAccess, type WriteAccess } from "@/domain/mcpWrite";
import type { Actor } from "@/domain/permission";

export type ConnectionKey = {
	userId: string;
	clientId: string;
	orgId: string;
	/** Scopes on the verified access token; absent = none (read only). */
	tokenScopes?: readonly string[];
};

/** The Actor plus whether this Connection may write right now (token ∩ consent ∩ org toggle). */
export type ConnectionActor = Actor & { write: WriteAccess };

// Structural: satisfied by the D1 drizzle client and by the sqlite stand-in used in tests.
// oxlint-disable-next-line typescript/no-explicit-any
type Db = BaseSQLiteDatabase<"async", any, any>;

/**
 * The Actor behind a Connection: the member's *current* role in the org, but only while a
 * consent row `(clientId, userId, referenceId=orgId)` exists. One query, so a removed member
 * (member row gone) or a revoked Connection (consent gone) is `null` on the very next call.
 * The same row yields the live consent scopes and the org's AI Client writes toggle, so `write`
 * (ADR 0006) reflects a downgrade or the toggle on the very next call too.
 */
export async function loadConnectionActor(
	db: Db,
	key: ConnectionKey
): Promise<ConnectionActor | null> {
	const [row] = await db
		.select({
			role: member.role,
			consentScopes: oauthConsent.scopes,
			aiClientWrites: orgSetting.aiClientWrites,
		})
		.from(member)
		.innerJoin(
			oauthConsent,
			and(
				eq(oauthConsent.userId, member.userId),
				eq(oauthConsent.referenceId, member.organizationId)
			)
		)
		.leftJoin(orgSetting, eq(orgSetting.organizationId, member.organizationId))
		.where(
			and(
				eq(member.userId, key.userId),
				eq(member.organizationId, key.orgId),
				eq(oauthConsent.clientId, key.clientId)
			)
		)
		.limit(1);
	if (!row) return null;
	const role = parseRole(row.role);
	if (!role) return null;
	const write = resolveWriteAccess({
		tokenScopes: key.tokenScopes ?? [],
		consentScopes: row.consentScopes,
		orgWritesOn: row.aiClientWrites ?? true,
	});
	return { userId: key.userId, organizationId: key.orgId, role, write };
}

/** The Actor verified for this request, handed over via `authInfo.extra.actor`. */
const actorOf = (authInfo: { extra?: Record<string, unknown> } | undefined) =>
	authInfo?.extra?.actor as (Actor & { write?: WriteAccess }) | undefined;

/** Effective write of the Actor verified for this request (default-deny when absent). */
export const writeAccessOf = (authInfo: { extra?: Record<string, unknown> } | undefined) =>
	actorOf(authInfo)?.write ?? READ_ONLY;

export function getActor(ctx: Pick<ServerContext, "http">): ConnectionActor {
	const actor = actorOf(ctx.http?.authInfo);
	if (!actor) throw new Error("MCP request reached a tool without a verified Actor");
	// Default-deny: an Actor that never went through `loadConnectionActor` can't write.
	return { ...actor, write: actor.write ?? READ_ONLY };
}
