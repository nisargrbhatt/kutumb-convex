import { auth } from "@/lib/auth";
import { db } from "@/db";
import { isInvitationPending } from "@/lib/invitation-preview";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import z from "zod";

export const authStateFn = createServerFn({ method: "GET" }).handler(async () => {
	const headers = getRequestHeaders();
	const session = await auth.api.getSession({ headers });

	return { session: session };
});

/**
 * Pre-session gate state for `/signup`: whether signups are closed, and — for an
 * invite link — the invited email to prefill read-only. Reads the invitation row
 * directly (not `auth.api.getInvitation`, which requires a session matching the
 * invited email, impossible before the account exists).
 */
export const getSignupGateStateFn = createServerFn({ method: "GET" })
	.validator(z.object({ invitationId: z.string().optional() }))
	.handler(async ({ data }) => {
		const signupDisabled = env.BETTER_AUTH_DISABLE_SIGNUP === "1";

		// Absolute, no invite exemption — skip the lookup entirely rather than resolve
		// an email the form can never use.
		if (signupDisabled || !data.invitationId) {
			return { signupDisabled, invitedEmail: null };
		}

		const invite = await db.query.invitation.findFirst({
			where: (fields, operators) => operators.eq(fields.id, data.invitationId!),
			columns: { email: true, status: true, expiresAt: true },
		});

		return {
			signupDisabled,
			invitedEmail: invite && isInvitationPending(invite) ? invite.email : null,
		};
	});
