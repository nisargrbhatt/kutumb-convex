import { createServerFn } from "@tanstack/react-start";
import { db } from "@/db";
import { AppError } from "@/domain/errors";
import { loadActiveOrgBilling } from "@/domain/queries/activeOrgBilling";
import { orgMiddlewareAllowLocked } from "@/middleware/org";

/**
 * Billing for the active org, any role (Lock-exempt): `_community` gate, `/locked` (owner list),
 * banner. Price only for owners.
 */
export const getActiveOrgBillingFn = createServerFn({ method: "GET" })
	.middleware([orgMiddlewareAllowLocked])
	.handler(async ({ context }) => {
		const { organizationId, userId } = context.actor;
		const r = await loadActiveOrgBilling(db, organizationId, userId, new Date());
		if (!r) throw new AppError("Forbidden", "Not a member of the active organization");
		return r;
	});
