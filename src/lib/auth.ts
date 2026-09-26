import { db } from "@/db";
import { betterAuth } from "better-auth/minimal";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { organization } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { env } from "cloudflare:workers";
import { ac, member, owner, admin } from "./permission";
import { createKvRateLimitStorage } from "./rate-limit-kv";
import { ORG_LIMIT, MEMBER_LIMIT } from "@/domain/limits";
import {
	databaseHooks,
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
		sendResetPassword,
	},
	emailVerification: {
		sendOnSignUp: true,
		sendVerificationEmail,
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
	databaseHooks,
	baseURL: env.BETTER_AUTH_URL,
	logger: {
		level: "debug",
		log: (level, message, ...args) => console.log(`[${level}] ${message}`, ...args),
	},
});
