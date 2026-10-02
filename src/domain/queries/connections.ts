import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import {
	oauthAccessToken,
	oauthClient,
	oauthConsent,
	oauthRefreshToken,
	organization,
} from "@/db/schema";
import { connectionActivity, type ConnectionStatus } from "@/domain/connections";
import {
	clientDisplayName,
	clientHost,
	registrationKind,
	type RegistrationKind,
} from "@/domain/mcpOauth";
import type { QueryDb } from "./db";

export type ConnectionRow = {
	/** The consent id — what Revoke targets. */
	id: string;
	clientId: string;
	clientName: string;
	host: string | null;
	registration: RegistrationKind;
	orgId: string;
	orgName: string;
	/** ms epoch */
	connectedAt: number;
	/** ms epoch; `null` = Never */
	lastUsedAt: number | null;
	status: ConnectionStatus;
};

export type EndedConnection = { clientId: string; orgId: string };

/** The caller's own Connections (consent ⋈ client ⋈ org), newest first, with derived activity. */
export async function listConnections(
	db: QueryDb,
	userId: string,
	now: number = Date.now()
): Promise<ConnectionRow[]> {
	const consents = await db
		.select({
			id: oauthConsent.id,
			clientId: oauthConsent.clientId,
			clientName: oauthClient.name,
			clientUri: oauthClient.uri,
			orgId: oauthConsent.referenceId,
			orgName: organization.name,
			connectedAt: oauthConsent.createdAt,
		})
		.from(oauthConsent)
		.innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
		.innerJoin(organization, eq(organization.id, oauthConsent.referenceId))
		.where(eq(oauthConsent.userId, userId))
		.orderBy(desc(oauthConsent.createdAt), desc(oauthConsent.id));

	// Only tokens issued since this consent was created: a revoked-then-reconnected Connection
	// starts fresh (older tokens belong to the Connection it replaced).
	const tokens = await db
		.select({
			consentId: oauthConsent.id,
			count: sql<number>`count(${oauthRefreshToken.id})`,
			newest: sql<number | null>`max(${oauthRefreshToken.createdAt})`,
		})
		.from(oauthConsent)
		.leftJoin(
			oauthRefreshToken,
			and(
				eq(oauthRefreshToken.userId, oauthConsent.userId),
				eq(oauthRefreshToken.clientId, oauthConsent.clientId),
				eq(oauthRefreshToken.referenceId, oauthConsent.referenceId),
				gte(oauthRefreshToken.createdAt, oauthConsent.createdAt)
			)
		)
		.where(eq(oauthConsent.userId, userId))
		.groupBy(oauthConsent.id);
	const byConsent = new Map(tokens.map((t) => [t.consentId, t]));

	return consents.flatMap((c) => {
		if (!c.orgId) return [];
		const t = byConsent.get(c.id);
		const connectedAt = c.connectedAt.getTime();
		return {
			id: c.id,
			clientId: c.clientId,
			clientName: clientDisplayName(c.clientName),
			host: clientHost(c.clientId, c.clientUri),
			registration: registrationKind(c.clientId),
			orgId: c.orgId,
			orgName: c.orgName,
			connectedAt,
			...connectionActivity(
				{
					connectedAt,
					tokenCount: Number(t?.count ?? 0),
					newestTokenAt: t?.newest == null ? null : Number(t.newest),
				},
				now
			),
		};
	});
}

/**
 * Kill the tokens first, then the consent: a failure in between leaves the Connection visible
 * (retryable) rather than a consent-less one with a live refresh token. Deleting a consent does not
 * revoke refresh tokens in the plugin, so we do (ADR 0004). `revoked` keeps earlier timestamps.
 */
async function endConnections(
	db: QueryDb,
	scope: { userId: string; orgId: string; clientId?: string },
	now: number
) {
	const revoked = new Date(now);
	const tokenScope = (t: typeof oauthRefreshToken | typeof oauthAccessToken) =>
		and(
			eq(t.userId, scope.userId),
			eq(t.referenceId, scope.orgId),
			scope.clientId ? eq(t.clientId, scope.clientId) : undefined,
			isNull(t.revoked)
		);
	await db.update(oauthRefreshToken).set({ revoked }).where(tokenScope(oauthRefreshToken));
	await db.update(oauthAccessToken).set({ revoked }).where(tokenScope(oauthAccessToken));
	await db
		.delete(oauthConsent)
		.where(
			and(
				eq(oauthConsent.userId, scope.userId),
				eq(oauthConsent.referenceId, scope.orgId),
				scope.clientId ? eq(oauthConsent.clientId, scope.clientId) : undefined
			)
		);
}

/** Revoke one of the caller's own Connections; `null` when it isn't theirs / doesn't exist. */
export async function revokeConnection(
	db: QueryDb,
	userId: string,
	consentId: string,
	now: number = Date.now()
): Promise<EndedConnection | null> {
	const [consent] = await db
		.select({ clientId: oauthConsent.clientId, orgId: oauthConsent.referenceId })
		.from(oauthConsent)
		.where(and(eq(oauthConsent.id, consentId), eq(oauthConsent.userId, userId)))
		.limit(1);
	if (!consent?.orgId) return null;
	await endConnections(db, { userId, orgId: consent.orgId, clientId: consent.clientId }, now);
	return { clientId: consent.clientId, orgId: consent.orgId };
}

/** A Connection ends with the member's membership: drop all theirs in that org. */
export async function removeMemberConnections(
	db: QueryDb,
	userId: string,
	orgId: string,
	now: number = Date.now()
): Promise<EndedConnection[]> {
	const consents = await db
		.select({ clientId: oauthConsent.clientId })
		.from(oauthConsent)
		.where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.referenceId, orgId)));
	if (consents.length === 0) return [];
	await endConnections(db, { userId, orgId }, now);
	return [...new Set(consents.map((c) => c.clientId))].map((clientId) => ({ clientId, orgId }));
}
