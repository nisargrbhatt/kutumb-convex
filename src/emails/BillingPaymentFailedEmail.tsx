import { Button, Heading, Section, Text } from "@react-email/components";
import { EMAIL_CONFIG } from "../lib/common";
import { EmailLayout, emailButtonClass } from "./EmailLayout";

export interface BillingPaymentFailedEmailProps {
	organizationName: string;
	/** Grace end, formatted. */
	date: string;
	/** `grace_t2`: the 2-days-left reminder; else the grace-start email. */
	reminder: boolean;
}

/** Grace start / grace end −2d (spec: Reminders). */
export default function BillingPaymentFailedEmail({
	organizationName,
	date,
	reminder,
}: BillingPaymentFailedEmailProps) {
	const heading = reminder
		? "2 days left to update payment"
		: `Payment failed for ${organizationName}`;
	return (
		<EmailLayout preview={heading} organizationName={organizationName}>
			<Heading className="m-0 mb-6 text-2xl font-semibold tracking-tight">{heading}</Heading>
			<Text className="m-0 mb-8 text-base leading-relaxed text-muted-foreground">
				{reminder ? "We still couldn't charge" : "We couldn't charge"} the payment method for{" "}
				<strong className="text-foreground">{organizationName}</strong>. Update it before {date} to
				keep your community open. Your data stays safe either way.
			</Text>
			<Section className="mb-8 text-center">
				<Button href={`${EMAIL_CONFIG.appUrl}/settings/billing`} className={emailButtonClass}>
					Update payment method
				</Button>
			</Section>
			<Text className="m-0 text-sm leading-relaxed text-muted-foreground">
				You're receiving this because you're an owner of {organizationName}.
			</Text>
		</EmailLayout>
	);
}

BillingPaymentFailedEmail.PreviewProps = {
	organizationName: "Acme Corp",
	date: "Dec 10, 2026",
	reminder: false,
} satisfies BillingPaymentFailedEmailProps;
