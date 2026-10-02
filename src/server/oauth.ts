import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import z from "zod";
import { db } from "@/db";
import { registrationKind, type RegistrationKind } from "@/domain/mcpOauth";
import type { Role } from "@/domain/permission";
import { auth } from "@/lib/auth";
import { markOrgPicked } from "@/lib/oauth-flow";
import { safeAsync } from "@/lib/safe";
import { authMiddleware } from "@/middleware/auth";

const clientInput = z.object({ clientId: z.string().trim().min(1) });

export type OauthClientInfo = {
	name: string;
	/** Host the client claims to be from (from its own metadata); display only, unverified for DCR. */
	host: string | null;
	registration: RegistrationKind;
};

export type OauthOrg = { id: string; name: string; slug: string; role: Role };

async function loadClient(clientId: string): Promise<OauthClientInfo | null> {
	const result = await safeAsync(
		auth.api.getOAuthClientPublic({
			headers: getRequestHeaders(),
			query: { client_id: clientId },
		})
	);
	if (!result.success) return null;
	const client = result.data;
	const registration = registrationKind(clientId);
	// CIMD: the host serving the metadata document is the verified identity (the client_id URL
	// itself), not anything the document claims. DCR: self-declared, display only.
	const uri = registration === "cimd" ? clientId : client.client_uri;
	return {
		name: client.client_name ?? "An app",
		host: (uri ? URL.parse(uri)?.host : null) ?? null,
		registration,
	};
}

async function loadOrg(userId: string, organizationId: string): Promise<OauthOrg | null> {
	const row = await db.query.member.findFirst({
		where: (f, o) => o.and(o.eq(f.userId, userId), o.eq(f.organizationId, organizationId)),
		columns: { role: true },
		with: { organization: { columns: { id: true, name: true, slug: true } } },
	});
	return row ? { ...row.organization, role: row.role as Role } : null;
}

async function loadOrgs(userId: string): Promise<OauthOrg[]> {
	const rows = await db.query.member.findMany({
		where: (f, o) => o.eq(f.userId, userId),
		columns: { role: true },
		with: { organization: { columns: { id: true, name: true, slug: true } } },
	});
	return rows
		.map((r) => ({ ...r.organization, role: r.role as Role }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** Data for `/oauth/select-org`: the requesting client + every community the member belongs to. */
export const getOauthSelectOrgFn = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(clientInput)
	.handler(async ({ context, data }) => {
		const [client, orgs] = await Promise.all([loadClient(data.clientId), loadOrgs(context.userId)]);
		return {
			client,
			orgs,
			activeOrganizationId: context.session.session.activeOrganizationId ?? null,
			email: context.session.user.email,
		};
	});

/** Data for `/oauth/consent`: the requesting client + the community it was just pointed at. */
export const getOauthConsentFn = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(clientInput)
	.handler(async ({ context, data }) => {
		const orgId = context.session.session.activeOrganizationId;
		const [client, org] = await Promise.all([
			loadClient(data.clientId),
			orgId ? loadOrg(context.userId, orgId) : null,
		]);
		return { client, org };
	});

/**
 * Pick the community for an AI Client: make it the active org (also switches the web session,
 * accepted) and leave the marker `postLogin.shouldRedirect` reads when the page then calls
 * `/oauth2/continue`.
 */
export const pickOauthOrgFn = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(z.object({ organizationId: z.string().trim().min(1) }))
	.handler(async ({ context, data }) => {
		await auth.api.setActiveOrganization({
			headers: getRequestHeaders(),
			body: { organizationId: data.organizationId },
		});
		await markOrgPicked(context.session.session.id, data.organizationId);
		return { ok: true as const };
	});

/**
 * Allow binds the Connection to the session's active org *at click time*, which any other tab
 * can change after this page loaded. Check it is still the org on screen right before Allow so
 * a member never consents to a community other than the one shown.
 */
export const assertConsentOrgFn = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(z.object({ organizationId: z.string().trim().min(1) }))
	.handler(async ({ context, data }) => ({
		same: context.session.session.activeOrganizationId === data.organizationId,
	}));
