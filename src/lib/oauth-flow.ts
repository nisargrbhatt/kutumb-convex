import { and, eq } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { db } from "@/db";
import { member, verification } from "@/db/schema";
import { ORG_PICK_TTL_MS, isOrgPickValid, orgPickIdentifier } from "@/domain/mcpOauth";

type FlowSession = { id: string; activeOrganizationId?: unknown };

const activeOrgOf = (session: FlowSession) =>
	typeof session.activeOrganizationId === "string" ? session.activeOrganizationId : null;

/** Called by the select-org server fn after `setActive`; read once by `shouldPickOrg`. */
export async function markOrgPicked(sessionId: string, organizationId: string): Promise<void> {
	const identifier = orgPickIdentifier(sessionId);
	await db.delete(verification).where(eq(verification.identifier, identifier));
	await db.insert(verification).values({
		id: crypto.randomUUID(),
		identifier,
		value: organizationId,
		expiresAt: new Date(Date.now() + ORG_PICK_TTL_MS),
	});
}

/** `postLogin.shouldRedirect`: true until the member has picked an org in this session. */
export async function shouldPickOrg(session: FlowSession): Promise<boolean> {
	const identifier = orgPickIdentifier(session.id);
	const row = await db.query.verification.findFirst({
		where: (f, o) => o.eq(f.identifier, identifier),
	});
	if (!row) return true;
	const picked = isOrgPickValid(
		{ value: row.value, expiresAt: row.expiresAt.getTime() },
		activeOrgOf(session),
		Date.now()
	);
	if (picked) await db.delete(verification).where(eq(verification.id, row.id));
	return !picked;
}

/** `postLogin.consentReferenceId`: the active org, which must still have this user as member. */
export async function consentOrganizationId(session: FlowSession, userId: string): Promise<string> {
	const organizationId = activeOrgOf(session);
	if (!organizationId) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_request",
			error_description: "no community selected",
		});
	}
	const row = await db.query.member.findFirst({
		where: and(eq(member.userId, userId), eq(member.organizationId, organizationId)),
		columns: { id: true },
	});
	if (!row) {
		throw new APIError("FORBIDDEN", {
			error: "access_denied",
			error_description: "not a member of the selected community",
		});
	}
	return organizationId;
}
