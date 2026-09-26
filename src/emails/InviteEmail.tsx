import { Button, Heading, Section, Text } from "@react-email/components";
import { EmailLayout, emailButtonClass } from "./EmailLayout";

interface InviteEmailProps {
	organizationName: string;
	inviterName?: string | null;
	inviterEmail?: string | null;
	inviteLink: string;
	role: string;
}

export default function InviteEmail({
	organizationName,
	inviterName,
	inviterEmail,
	inviteLink,
	role,
}: InviteEmailProps) {
	const inviterText = inviterName || inviterEmail || "Someone";

	return (
		<EmailLayout
			preview={`You have been invited to join ${organizationName}`}
			organizationName={organizationName}
		>
			<Heading className="m-0 mb-6 text-2xl font-semibold tracking-tight">
				Join {organizationName}
			</Heading>
			<Text className="m-0 mb-6 text-base leading-relaxed text-muted-foreground">Hi there,</Text>
			<Text className="m-0 mb-8 text-base leading-relaxed text-muted-foreground">
				<strong className="text-foreground">{inviterText}</strong> has invited you to join their
				organization, <strong className="text-foreground">{organizationName}</strong>, as a {role}.
			</Text>
			<Section className="mb-8 text-center">
				<Button href={inviteLink} className={emailButtonClass}>
					Accept Invitation
				</Button>
			</Section>
			<Text className="m-0 text-sm leading-relaxed text-muted-foreground">
				If you did not expect this invitation, you can safely ignore this email.
			</Text>
		</EmailLayout>
	);
}

InviteEmail.PreviewProps = {
	organizationName: "Acme Corp",
	inviterName: "John Doe",
	inviterEmail: "john@example.com",
	inviteLink: "https://example.com/login?redirectTo=%2Fonboarding%2Finvitations&invitation=abc",
	role: "member",
} satisfies InviteEmailProps;
