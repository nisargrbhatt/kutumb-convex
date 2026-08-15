import { db } from "@/db";
import type { BILLING_STATUS } from "@/db/constants";
import { mapSubscriptionStatus } from "./billing-status-map";

export type BillingStatus = (typeof BILLING_STATUS)[keyof typeof BILLING_STATUS];

export async function resolveBillingStatus(orgId: string): Promise<BillingStatus> {
	const sub = await db.query.subscription.findFirst({
		where: (fields, op) => op.eq(fields.referenceId, orgId),
		columns: { status: true },
	});

	return mapSubscriptionStatus(sub?.status);
}
