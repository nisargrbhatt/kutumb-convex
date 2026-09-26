import { Button, Heading, Section, Text } from "@react-email/components";
import { EmailLayout, emailButtonClass } from "./EmailLayout";

interface VerifyEmailProps {
	verifyLink: string;
}

export default function VerifyEmail({ verifyLink }: VerifyEmailProps) {
	return (
		<EmailLayout preview="Verify your email for Kutumb">
			<Heading className="m-0 mb-6 text-2xl font-semibold tracking-tight">
				Verify your email
			</Heading>
			<Text className="m-0 mb-8 text-base leading-relaxed text-muted-foreground">
				Confirm this address so we can reach you about your Kutumb account.
			</Text>
			<Section className="mb-8 text-center">
				<Button href={verifyLink} className={emailButtonClass}>
					Verify email
				</Button>
			</Section>
			<Text className="m-0 mb-6 text-sm break-all text-muted-foreground">{verifyLink}</Text>
			<Text className="m-0 text-sm leading-relaxed text-muted-foreground">
				This link expires in 1 hour. If you didn't create a Kutumb account, you can ignore this
				email.
			</Text>
		</EmailLayout>
	);
}

VerifyEmail.PreviewProps = {
	verifyLink: "https://example.com/api/auth/verify-email?token=abc123&callbackURL=%2F",
} satisfies VerifyEmailProps;
