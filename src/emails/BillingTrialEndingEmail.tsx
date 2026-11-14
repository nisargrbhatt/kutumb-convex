import { Button, Heading, Section, Text } from "@react-email/components";
import { EMAIL_CONFIG } from "../lib/common";
import { EmailLayout, emailButtonClass } from "./EmailLayout";

export interface BillingTrialEndingEmailProps {
	organizationName: string;
	/** Trial end, formatted. */
	date: string;
	/** `trial_t1`: one day left. */
	lastDay: boolean;
	hasPaymentMethod: boolean;
}

/** Trial T-3 / T-1 (spec: Reminders). Card on file → first-charge notice; else lock warning. */
export default function BillingTrialEndingEmail({
	organizationName,
	date,
	lastDay,
	hasPaymentMethod,
}: BillingTrialEndingEmailProps) {
	const heading = hasPaymentMethod
		? `Your trial ends on ${date}`
		: lastDay
			? `${organizationName} locks tomorrow`
			: `${organizationName} locks on ${date}`;
	return (
		<EmailLayout preview={heading} organizationName={organizationName}>
			<Heading className="m-0 mb-6 text-2xl font-semibold tracking-tight">{heading}</Heading>
			<Text className="m-0 mb-8 text-base leading-relaxed text-muted-foreground">
				{hasPaymentMethod ? (
					<>
						The free trial for <strong className="text-foreground">{organizationName}</strong> ends
						on {date}. Your first charge of $5 goes through on that day. Nothing to do if that's
						what you want.
					</>
				) : (
					<>
						The free trial for <strong className="text-foreground">{organizationName}</strong> ends{" "}
						{lastDay ? "tomorrow" : `on ${date}`}. Add a payment method to keep your community open.
						Your data stays safe either way.
					</>
				)}
			</Text>
			<Section className="mb-8 text-center">
				<Button href={`${EMAIL_CONFIG.appUrl}/settings/billing`} className={emailButtonClass}>
					{hasPaymentMethod ? "Manage billing" : "Add payment method"}
				</Button>
			</Section>
			<Text className="m-0 text-sm leading-relaxed text-muted-foreground">
				You're receiving this because you're an owner of {organizationName}.
			</Text>
		</EmailLayout>
	);
}

BillingTrialEndingEmail.PreviewProps = {
	organizationName: "Acme Corp",
	date: "Nov 29, 2026",
	lastDay: false,
	hasPaymentMethod: false,
} satisfies BillingTrialEndingEmailProps;
