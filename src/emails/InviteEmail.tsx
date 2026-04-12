import {
	Html,
	Head,
	Preview,
	Body,
	Container,
	Heading,
	Text,
	Button,
	Tailwind,
	Hr,
	pixelBasedPreset,
	Section,
} from "@react-email/components";
import React from "react";

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
	const inviterText = inviterName ? inviterName : inviterEmail ? inviterEmail : "Someone";

	return (
		<Html lang="en">
			<Tailwind
				config={{
					presets: [pixelBasedPreset],
					theme: {
						extend: {
							colors: {
								brand: "#111827",
								muted: "#6b7280",
							},
						},
					},
				}}
			>
				<Head />
				<Body className="mx-auto bg-gray-50 font-sans text-gray-900">
					<Preview>You have been invited to join {organizationName}</Preview>
					<Container className="mx-auto mt-12 mb-12 max-w-xl rounded-lg border border-solid border-gray-100 bg-white p-8 shadow-sm">
						<Heading className="text-brand m-0 mb-6 text-2xl font-semibold tracking-tight">
							Join {organizationName}
						</Heading>

						<Text className="m-0 mb-6 text-base leading-relaxed text-gray-600">Hi there,</Text>

						<Text className="m-0 mb-8 text-base leading-relaxed text-gray-600">
							<strong className="text-brand">{inviterText}</strong> has invited you to join their
							organization, <strong className="text-brand">{organizationName}</strong>, as a {role}.
						</Text>

						<Section className="mb-8 text-center">
							<Button
								href={inviteLink}
								className="bg-brand box-border block w-full rounded-md px-6 py-3 text-center text-sm font-medium text-white no-underline"
							>
								Accept Invitation
							</Button>
						</Section>

						<Hr className="m-0 mb-6 border-t border-solid border-gray-200" />

						<Text className="m-0 text-sm leading-relaxed text-muted">
							If you did not expect this invitation, you can safely ignore this email.
						</Text>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
}

InviteEmail.PreviewProps = {
	organizationName: "Acme Corp",
	inviterName: "John Doe",
	inviterEmail: "john@example.com",
	inviteLink: "https://example.com/onboarding/invitations",
	role: "member",
} satisfies InviteEmailProps;
