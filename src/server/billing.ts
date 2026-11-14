import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orgBilling } from "@/db/schema";
import { billingAccess } from "@/domain/billing";
import { AppError } from "@/domain/errors";
import { assertCan } from "@/domain/permission";
import { pullSubscriptionIntoRow } from "@/lib/billing-sync";
import { createDodo } from "@/lib/dodo";
import { orgMiddleware } from "@/middleware/org";

/**
 * Owner, back from Dodo (`?from=dodo`): pull the current sub and overwrite the row, so the page
 * doesn't wait for the webhook. Returns the fresh access.
 */
export const syncBillingFn = createServerFn({ method: "POST" })
	// TODO(billing #17): switch to `orgMiddlewareAllowLocked` (the lock screen polls this).
	.middleware([orgMiddleware])
	.handler(async ({ context }) => {
		assertCan(context.actor, { billing: ["manage"] });
		const { organizationId } = context.actor;
		let [row] = await db
			.select()
			.from(orgBilling)
			.where(eq(orgBilling.organizationId, organizationId));
		if (!row) throw new AppError("NotFound", "No billing for this organization");
		const now = new Date();
		if (row.subscriptionId) {
			row =
				(await pullSubscriptionIntoRow(db, createDodo(), {
					organizationId,
					subscriptionId: row.subscriptionId,
					now,
				})) ?? row;
		}
		return billingAccess(row, now);
	});
