import { db } from "@/db";
import { betterAuth } from "better-auth/minimal";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { organization } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { env } from "cloudflare:workers";
import { ac, member, owner, admin } from "./permission";
import { resend } from "./resend";
import InviteEmail from "@/emails/InviteEmail";
import VerifyEmail from "@/emails/VerifyEmail";
import ResetPasswordEmail from "@/emails/ResetPasswordEmail";
import { EMAIL_CONFIG } from "./common";
import { createKvRateLimitStorage } from "./rate-limit-kv";

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "sqlite",
	}),
	plugins: [
		tanstackStartCookies(),
		organization({
			ac: ac,
			roles: {
				owner: owner,
				admin: admin,
				member: member,
			},
			sendInvitationEmail: async (payload) => {
				const inviteLink = `${env.BETTER_AUTH_URL}/login?redirectTo=${encodeURIComponent("/onboarding/invitations")}&invitation=${encodeURIComponent(payload.id)}`;

				try {
					const { error } = await resend.emails.send({
						from: EMAIL_CONFIG.from,
						to: payload.email,
						subject: `You've been invited to join ${payload.organization.name}`,
						react: InviteEmail({
							organizationName: payload.organization.name,
							inviterName: payload.inviter?.user?.name,
							inviterEmail: payload.inviter?.user?.email,
							inviteLink: inviteLink,
							role: payload.role,
						}),
					});

					if (error) {
						console.error("Resend API correctly returned error:", error);
					}
				} catch (error) {
					console.error("Failed to send invitation email", error);
				}
			},
		}),
	],
	// 🔒 account.accountLinking.requireLocalEmailVerified defaults to true — left unset,
	// never set to false. It's the only thing blocking pre-registration takeover now that
	// requireEmailVerification is off (attacker registers unverified password account on
	// victim's email, victim signs in with Google — link is refused without it). Any
	// better-auth upgrade must re-verify this default hasn't flipped.
	emailAndPassword: {
		enabled: true,
		disableSignUp: env.BETTER_AUTH_DISABLE_SIGNUP === "1",
		requireEmailVerification: false,
		autoSignIn: true,
		minPasswordLength: 8,
		sendResetPassword: async ({ user, url }) => {
			try {
				const { error } = await resend.emails.send({
					from: EMAIL_CONFIG.from,
					to: user.email,
					subject: "Reset your Kutumb password",
					react: ResetPasswordEmail({ resetLink: url }),
				});

				if (error) {
					console.error("Resend API correctly returned error:", error);
				}
			} catch (error) {
				console.error("Failed to send reset password email", error);
			}
		},
	},
	emailVerification: {
		sendOnSignUp: true,
		sendVerificationEmail: async ({ user, url }) => {
			try {
				const { error } = await resend.emails.send({
					from: EMAIL_CONFIG.from,
					to: user.email,
					subject: "Verify your email for Kutumb",
					react: VerifyEmail({ verifyLink: url }),
				});

				if (error) {
					console.error("Resend API correctly returned error:", error);
				}
			} catch (error) {
				console.error("Failed to send verification email", error);
			}
		},
	},
	// Only the rate limiter points at KV — not secondaryStorage, which would also
	// relocate session storage onto KV's eventual consistency (every request, plus
	// logout/session revocation).
	rateLimit: {
		customStorage: createKvRateLimitStorage(env.KV),
	},
	secret: env.BETTER_AUTH_SECRET,
	socialProviders: {
		google: {
			disableSignUp: env.BETTER_AUTH_DISABLE_SIGNUP === "1",
			clientId: env.GOOGLE_CLIENT_ID,
			clientSecret: env.GOOGLE_CLIENT_SECRET,
		},
	},
	databaseHooks: {
		session: {
			create: {
				before: async (session) => {
					const firstOrganization = await db.query.member.findFirst({
						where: (fields, operators) => operators.eq(fields.userId, session.userId),
						columns: {
							organizationId: true,
						},
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
	},
	baseURL: env.BETTER_AUTH_URL,
	logger: {
		disabled: false,
		disableColors: false,
		level: "debug",
		log: (level, message, ...args) => {
			// Custom logging implementation
			console.log(`[${level}] ${message}`, ...args);
		},
	},
});
