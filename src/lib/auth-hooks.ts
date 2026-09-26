import { APIError } from "better-auth/api";
import type { BetterAuthOptions } from "better-auth";
import type { OrganizationOptions } from "better-auth/plugins";
import { env } from "cloudflare:workers";
import { db } from "@/db";
import { LIMIT_COPY, LimitError } from "@/domain/limits";
import { ONBOARDING_INVITATIONS_PATH, loginHref } from "@/domain/authRoutes";
import InviteEmail from "@/emails/InviteEmail";
import ResetPasswordEmail from "@/emails/ResetPasswordEmail";
import VerifyEmail from "@/emails/VerifyEmail";
import { sendEmail } from "./email";
import { limits } from "./limits";

/** Run a limit assertion; a `LimitError` becomes a FORBIDDEN `APIError` carrying its code. */
async function limitGuard(assert: () => Promise<void>, message: string) {
	try {
		await assert();
	} catch (e) {
		if (e instanceof LimitError) throw new APIError("FORBIDDEN", { code: e.code, message });
		throw e;
	}
}

export const organizationHooks = {
	beforeAcceptInvitation: async ({ user }) =>
		limitGuard(() => limits.assertOrgSlot(user.id), LIMIT_COPY.orgAccept.description),
	beforeCreateInvitation: async ({ organization }) =>
		limitGuard(() => limits.assertMemberSlot(organization.id), LIMIT_COPY.memberInvite.description),
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
