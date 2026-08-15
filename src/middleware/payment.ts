import { redirect } from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";
import { authMiddleware } from "@/middleware/auth";
import { resolveBillingStatus } from "@/lib/billing-status";
import { BILLING_STATUS_ROUTE } from "@/lib/billing-status-map";
import { BILLING_STATUS } from "@/db/constants";

/**
 * Guards community feature server fns: blocks (read + write) any org whose
 * effective billing status is not `active`. Composes authMiddleware, so
 * `context.session` / `context.userId` stay available.
 */
export const paymentMiddleware = createMiddleware()
	.middleware([authMiddleware])
	.server(async ({ next, context }) => {
		const orgId = context.session?.session?.activeOrganizationId;
		if (typeof orgId !== "string") {
			throw redirect({ to: "/onboarding/create" });
		}

		const status = await resolveBillingStatus(orgId);
		if (status !== BILLING_STATUS.active) {
			throw redirect({ to: BILLING_STATUS_ROUTE[status] });
		}

		return next();
	});
