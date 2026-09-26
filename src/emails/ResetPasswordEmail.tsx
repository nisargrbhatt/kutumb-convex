import { Button, Heading, Section, Text } from "@react-email/components";
import { EmailLayout, emailButtonClass } from "./EmailLayout";

interface ResetPasswordEmailProps {
	resetLink: string;
}

export default function ResetPasswordEmail({ resetLink }: ResetPasswordEmailProps) {
	return (
		<EmailLayout preview="Reset your Kutumb password">
			<Heading className="m-0 mb-6 text-2xl font-semibold tracking-tight">
				Reset your password
			</Heading>
			<Text className="m-0 mb-8 text-base leading-relaxed text-muted-foreground">
				Someone asked to reset the password for this account. If that was you, choose a new one.
			</Text>
			<Section className="mb-8 text-center">
				<Button href={resetLink} className={emailButtonClass}>
					Reset password
				</Button>
			</Section>
			<Text className="m-0 mb-6 text-sm break-all text-muted-foreground">{resetLink}</Text>
			<Text className="m-0 text-sm leading-relaxed text-muted-foreground">
				This link expires in 1 hour. If you didn't ask for this, you can safely ignore this email —
				your password won't change.
			</Text>
		</EmailLayout>
	);
}

ResetPasswordEmail.PreviewProps = {
	resetLink: "https://example.com/api/auth/reset-password/abc123?callbackURL=%2Freset-password",
} satisfies ResetPasswordEmailProps;
