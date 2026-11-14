import { db } from "@/db";
import { graceStartNotice } from "@/domain/billingNotices";
import { makeBillingNotifier, makeBillingSweep } from "@/domain/billingSweep";
import { sendBillingEmail } from "@/lib/billing-email";
import { captureBillingEvent } from "@/lib/posthog-server";
import { ensureSubscription } from "@/server/billing";

const deps = {
	db,
	now: () => new Date(),
	email: sendBillingEmail,
	capture: captureBillingEvent,
};

const notifier = makeBillingNotifier(deps);

/** Hourly billing sweep wired to D1, Dodo, Resend and PostHog (spec: Reminders). */
export const billingSweep = makeBillingSweep({
	...deps,
	ensureSubscription,
});

/** Webhook's `notifyGraceStart` dep: grace-start email to all owners, deduped per grace. */
export const notifyGraceStart = (
	row: Parameters<typeof graceStartNotice>[0] & {
		organizationId: string;
		createdByUserId: string;
		hasPaymentMethod: boolean;
	}
) => notifier.deliver(row, graceStartNotice(row));
