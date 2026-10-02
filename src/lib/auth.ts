import { db } from "@/db";
import { betterAuth } from "better-auth/minimal";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { jwt, organization } from "better-auth/plugins";
import { mcp } from "@better-auth/mcp";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { env } from "cloudflare:workers";
import { ac, member, owner, admin } from "./permission";
import { createD1RateLimitStorage } from "./rate-limit-d1";
import { ORG_LIMIT, MEMBER_LIMIT } from "@/domain/limits";
import {
	ACCESS_TOKEN_TTL_SECONDS,
	MCP_SCOPES,
	OAUTH_CONSENT_PATH,
	OAUTH_RATE_LIMITS,
	OAUTH_SELECT_ORG_PATH,
	ORG_CLAIM,
	REFRESH_TOKEN_REUSE_SECONDS,
	REFRESH_TOKEN_TTL_SECONDS,
	mcpResourceUrl,
} from "@/domain/mcpOauth";
import { LOGIN_PATH } from "@/domain/authRoutes";
import { consentOrganizationId, shouldPickOrg } from "./oauth-flow";
import {
	databaseHooks,
	mcpHooks,
	organizationHooks,
	sendInvitationEmail,
	sendResetPassword,
	sendVerificationEmail,
} from "./auth-hooks";

export const auth = betterAuth({
	database: drizzleAdapter(db, { provider: "sqlite" }),
	plugins: [
		tanstackStartCookies(),
		organization({
			ac: ac,
			roles: { owner, admin, member },
			organizationLimit: ORG_LIMIT,
			membershipLimit: MEMBER_LIMIT,
			invitationLimit: MEMBER_LIMIT,
			organizationHooks,
			sendInvitationEmail,
		}),
		jwt(),
		// ADR 0004: a Connection is one oauthConsent row (clientId, userId, referenceId=orgId).
		// The org is picked on /oauth/select-org (postLogin) and rides on the consent + JWT.
		mcp({
			loginPage: LOGIN_PATH,
			consentPage: OAUTH_CONSENT_PATH,
			resource: mcpResourceUrl(env.BETTER_AUTH_URL),
			scopes: [...MCP_SCOPES],
			allowDynamicClientRegistration: true,
			allowUnauthenticatedClientRegistration: true,
			accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
			refreshTokenExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
			refreshTokenReuseInterval: REFRESH_TOKEN_REUSE_SECONDS,
			postLogin: {
				page: OAUTH_SELECT_ORG_PATH,
				shouldRedirect: ({ session }) => shouldPickOrg(session),
				consentReferenceId: ({ session, user }) => consentOrganizationId(session, user.id),
			},
			customAccessTokenClaims: ({ referenceId }) =>
				referenceId ? { [ORG_CLAIM]: referenceId } : {},
			rateLimit: OAUTH_RATE_LIMITS,
		}),
	],
	hooks: mcpHooks,
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
		sendResetPassword,
	},
	emailVerification: {
		sendOnSignUp: true,
		sendVerificationEmail,
	},
	// Only the rate limiter has custom storage (D1, atomic consume) — not secondaryStorage,
	// which would also relocate session storage (every request, plus logout/revocation).
	rateLimit: {
		customStorage: createD1RateLimitStorage(env.D1),
	},
	// Rate limits (incl. OAuth register 5/h/IP) key on client IP; behind Cloudflare that is this
	// header. Unset, every request falls into one shared `no-trusted-ip` bucket.
	advanced: {
		ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
	},
	secret: env.BETTER_AUTH_SECRET,
	socialProviders: {
		google: {
			disableSignUp: env.BETTER_AUTH_DISABLE_SIGNUP === "1",
			clientId: env.GOOGLE_CLIENT_ID,
			clientSecret: env.GOOGLE_CLIENT_SECRET,
		},
	},
	databaseHooks,
	baseURL: env.BETTER_AUTH_URL,
	logger: {
		level: "debug",
		log: (level, message, ...args) => console.log(`[${level}] ${message}`, ...args),
	},
});
