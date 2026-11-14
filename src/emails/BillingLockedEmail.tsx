import { Button, Heading, Section, Text } from "@react-email/components";
import type { LockReason } from "../domain/billing";
import { EMAIL_CONFIG } from "../lib/common";
import { EmailLayout, emailButtonClass } from "./EmailLayout";

export interface BillingLockedEmailProps {
	organizationName: string;
	lockReason: LockReason;
}

const WHY: Record<LockReason, string> = {
	trial_ended: "its free trial ended without a payment method",
	payment_failed: "we couldn't collect payment",
	canceled: "its subscription was canceled",
};

/** Once per Lock (spec: Reminders); copy per `lockReason`. */
export default function BillingLockedEmail({
	organizationName,
	lockReason,
}: BillingLockedEmailProps) {
	const heading = `${organizationName} is locked`;
	return (
		<EmailLayout preview={heading} organizationName={organizationName}>
			<Heading className="m-0 mb-6 text-2xl font-semibold tracking-tight">{heading}</Heading>
			<Text className="m-0 mb-8 text-base leading-relaxed text-muted-foreground">
				<strong className="text-foreground">{organizationName}</strong> is locked because{" "}
				{WHY[lockReason]}. Your data is safe. Subscribe to unlock it for everyone.
			</Text>
			<Section className="mb-8 text-center">
				<Button href={`${EMAIL_CONFIG.appUrl}/locked`} className={emailButtonClass}>
					Unlock {organizationName}
				</Button>
			</Section>
			<Text className="m-0 text-sm leading-relaxed text-muted-foreground">
				You're receiving this because you're an owner of {organizationName}.
			</Text>
		</EmailLayout>
	);
}

BillingLockedEmail.PreviewProps = {
	organizationName: "Acme Corp",
	lockReason: "trial_ended",
} satisfies BillingLockedEmailProps;
