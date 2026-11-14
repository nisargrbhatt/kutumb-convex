import type { ReactElement } from "react";
import type { BillingEmail } from "@/domain/billingSweep";
import BillingLockedEmail from "@/emails/BillingLockedEmail";
import BillingPaymentFailedEmail from "@/emails/BillingPaymentFailedEmail";
import BillingTrialEndingEmail from "@/emails/BillingTrialEndingEmail";
import { trySendEmail } from "./email";

const formatDate = (d: Date) =>
	d.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	});

/** Subject + template for a billing notice (spec: Reminders). */
export function renderBillingEmail(e: BillingEmail): { subject: string; react: ReactElement } {
	const org = e.organizationName;
	const date = formatDate(e.deadline);
	switch (e.kind) {
		case "trial_t3":
		case "trial_t1": {
			const lastDay = e.kind === "trial_t1";
			return {
				subject: e.hasPaymentMethod
					? `${org}: first charge of $5 on ${date}`
					: `${org}: add a payment method or it locks ${lastDay ? "tomorrow" : `on ${date}`}`,
				react: (
					<BillingTrialEndingEmail
						organizationName={org}
						date={date}
						lastDay={lastDay}
						hasPaymentMethod={e.hasPaymentMethod}
					/>
				),
			};
		}
		case "grace_start":
		case "grace_t2": {
			const reminder = e.kind === "grace_t2";
			return {
				subject: reminder
					? `${org}: 2 days left to update payment`
					: `${org}: payment failed, update before ${date}`,
				react: <BillingPaymentFailedEmail organizationName={org} date={date} reminder={reminder} />,
			};
		}
		case "locked":
			return {
				subject: `${org} is locked`,
				react: (
					<BillingLockedEmail organizationName={org} lockReason={e.lockReason ?? "trial_ended"} />
				),
			};
	}
}

/** `makeBillingNotifier`'s `email` dep: one owner, one Resend send. */
export const sendBillingEmail = (to: string, e: BillingEmail) =>
	trySendEmail({ to, ...renderBillingEmail(e) });
