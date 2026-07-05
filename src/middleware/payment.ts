import { redirect } from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";
import { authMiddleware } from "@/middleware/auth";
import { resolveOrgStatus } from "@/lib/org-status";
import { ORGANIZATION_STATUS } from "@/db/constants";

/**
 * Guards community feature server fns: blocks (read + write) any org whose
 * effective billing status is `pending` (trial elapsed or subscription lapsed).
 * Composes authMiddleware, so `context.session` / `context.userId` stay available.
 */
export const paymentMiddleware = createMiddleware()
	.middleware([authMiddleware])
	.server(async ({ next, context }) => {
		const orgId = context.session?.session?.activeOrganizationId;
		if (typeof orgId !== "string") {
			throw redirect({ to: "/onboarding/create" });
		}

		const { status } = await resolveOrgStatus(orgId);
		if (status === ORGANIZATION_STATUS.pending) {
			throw redirect({ to: "/payment-required" });
		}

		return next();
	});
