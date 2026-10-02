import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import type { BetterAuthOptions } from "better-auth";
import type { OrganizationOptions } from "better-auth/plugins";
import { env } from "cloudflare:workers";
import { db } from "@/db";
import { removeMemberConnections } from "@/domain/queries/connections";
import { LIMIT_COPY, LimitError } from "@/domain/limits";
import { ONBOARDING_INVITATIONS_PATH, loginHref } from "@/domain/authRoutes";
import { inferApplicationType, registrationKind } from "@/domain/mcpOauth";
import InviteEmail from "@/emails/InviteEmail";
import ResetPasswordEmail from "@/emails/ResetPasswordEmail";
import VerifyEmail from "@/emails/VerifyEmail";
import { safeAsync } from "./safe";
import { sendEmail } from "./email";
import { limits } from "./limits";
import { captureMcpConnectionCreated } from "./posthog-server";

/** Run a limit assertion; a `LimitError` becomes a FORBIDDEN `APIError` carrying its code. */
async function limitGuard(assert: () => Promise<void>, message: string) {
	try {
		await assert();
	} catch (e) {
		if (e instanceof LimitError) throw new APIError("FORBIDDEN", { code: e.code, message });
		throw e;
	}
}

/** The member is already gone: never fail the request over cleanup; the live check still 401s. */
async function dropConnections(userId: string, organizationId: string) {
	const result = await safeAsync(removeMemberConnections(db, userId, organizationId));
	if (!result.success) console.error("Failed to drop Connections of removed member", result.error);
}

export const organizationHooks = {
	beforeAcceptInvitation: async ({ user }) =>
		limitGuard(() => limits.assertOrgSlot(user.id), LIMIT_COPY.orgAccept.description),
	beforeCreateInvitation: async ({ organization }) =>
		limitGuard(() => limits.assertMemberSlot(organization.id), LIMIT_COPY.memberInvite.description),
	// A Connection ends with the member's membership (ADR 0004).
	afterRemoveMember: async ({ user, organization }) => {
		await dropConnections(user.id, organization.id);
	},
} satisfies NonNullable<OrganizationOptions["organizationHooks"]>;

export const sendInvitationEmail: NonNullable<OrganizationOptions["sendInvitationEmail"]> = async (
	payload
) => {
	const inviteLink = `${env.BETTER_AUTH_URL}${loginHref({
		redirectTo: ONBOARDING_INVITATIONS_PATH,
		invitation: payload.id,
	})}`;
	await sendEmail({
		to: payload.email,
		subject: `You've been invited to join ${payload.organization.name}`,
		react: InviteEmail({
			organizationName: payload.organization.name,
			inviterName: payload.inviter?.user?.name,
			inviterEmail: payload.inviter?.user?.email,
			inviteLink,
			role: payload.role,
		}),
	});
};

type EmailPasswordOptions = NonNullable<BetterAuthOptions["emailAndPassword"]>;
type EmailVerificationOptions = NonNullable<BetterAuthOptions["emailVerification"]>;

export const sendResetPassword: NonNullable<EmailPasswordOptions["sendResetPassword"]> = async ({
	user,
	url,
}) =>
	sendEmail({
		to: user.email,
		subject: "Reset your Kutumb password",
		react: ResetPasswordEmail({ resetLink: url }),
	});

export const sendVerificationEmail: NonNullable<
	EmailVerificationOptions["sendVerificationEmail"]
> = async ({ user, url }) =>
	sendEmail({
		to: user.email,
		subject: "Verify your email for Kutumb",
		react: VerifyEmail({ verifyLink: url }),
	});

/** New sessions start on the user's first org so `activeOrganizationId` is set after sign-in. */
export const databaseHooks = {
	session: {
		create: {
			before: async (session) => {
				const firstOrganization = await db.query.member.findFirst({
					where: (fields, operators) => operators.eq(fields.userId, session.userId),
					columns: { organizationId: true },
				});

				return {
					data: {
						...session,
						activeOrganizationId: firstOrganization?.organizationId ?? null,
					},
				};
			},
		},
	},
} satisfies BetterAuthOptions["databaseHooks"];

export const mcpHooks = {
	// DCR without `application_type` defaults to `web`, which rejects loopback redirects.
	before: createAuthMiddleware(async (ctx) => {
		if (ctx.path !== "/oauth2/register") return;
		const body = ctx.body as { application_type?: string; redirect_uris?: unknown } | undefined;
		if (!body || body.application_type !== undefined || !Array.isArray(body.redirect_uris)) return;
		const inferred = inferApplicationType(body.redirect_uris.filter((u) => typeof u === "string"));
		if (!inferred) return;
		return { context: { ...ctx, body: { ...body, application_type: inferred } } };
	}),
	/**
	 * Leave → drop Connections. `mcp_connection_created`: consent was Allowed and the flow ended in
	 * an authorization code.
	 */
	after: createAuthMiddleware(async (ctx) => {
		// Leaving fires no `afterRemoveMember`; same rule: no membership, no Connection.
		if (ctx.path === "/organization/leave") {
			const organizationId = (ctx.body as { organizationId?: unknown } | undefined)?.organizationId;
			if (typeof organizationId !== "string" || ctx.context.returned instanceof Error) return;
			const session = await getSessionFromCtx(ctx);
			if (session) await dropConnections(session.user.id, organizationId);
			return;
		}
		if (ctx.path !== "/oauth2/consent" || ctx.body?.accept !== true) return;
		const returned = ctx.context.returned as { url?: unknown } | undefined;
		if (typeof returned?.url !== "string") return;
		const redirect = URL.parse(returned.url);
		if (!redirect?.searchParams.has("code")) return;
		const session = await getSessionFromCtx(ctx);
		const organizationId = session?.session.activeOrganizationId;
		const clientId = (ctx.body as { oauth_query?: string }).oauth_query
			? new URLSearchParams(ctx.body.oauth_query).get("client_id")
			: null;
		if (!session || !organizationId || !clientId) return;
		captureMcpConnectionCreated({
			userId: session.user.id,
			organizationId,
			clientId,
			registration: registrationKind(clientId),
		});
	}),
} satisfies BetterAuthOptions["hooks"];
