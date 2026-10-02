import { and, eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { ServerContext } from "@modelcontextprotocol/server";
import { member, oauthConsent } from "@/db/schema";
import { parseRole } from "@/domain/mcpEndpoint";
import type { Actor } from "@/domain/permission";

export type ConnectionKey = { userId: string; clientId: string; orgId: string };

// Structural: satisfied by the D1 drizzle client and by the sqlite stand-in used in tests.
// oxlint-disable-next-line typescript/no-explicit-any
type Db = BaseSQLiteDatabase<"async", any, any>;

/**
 * The Actor behind a Connection: the member's *current* role in the org, but only while a
 * consent row `(clientId, userId, referenceId=orgId)` exists. One query, so a removed member
 * (member row gone) or a revoked Connection (consent gone) is `null` on the very next call.
 */
export async function loadConnectionActor(db: Db, key: ConnectionKey): Promise<Actor | null> {
	const [row] = await db
		.select({ role: member.role })
		.from(member)
		.innerJoin(
			oauthConsent,
			and(
				eq(oauthConsent.userId, member.userId),
				eq(oauthConsent.referenceId, member.organizationId)
			)
		)
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
	return role ? { userId: key.userId, organizationId: key.orgId, role } : null;
}

/** The Actor verified for this request, handed over via `authInfo.extra.actor`. */
export function getActor(ctx: Pick<ServerContext, "http">): Actor {
	const actor = ctx.http?.authInfo?.extra?.actor as Actor | undefined;
	if (!actor) throw new Error("MCP request reached a tool without a verified Actor");
	return actor;
}
