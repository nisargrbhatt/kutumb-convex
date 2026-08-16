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

interface VerifyEmailProps {
	verifyLink: string;
}

export default function VerifyEmail({ verifyLink }: VerifyEmailProps) {
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
					<Preview>Verify your email for Kutumb</Preview>
					<Container className="mx-auto mt-12 mb-12 max-w-xl rounded-lg border border-solid border-gray-100 bg-white p-8 shadow-sm">
						<Heading className="text-brand m-0 mb-6 text-2xl font-semibold tracking-tight">
							Verify your email
						</Heading>

						<Text className="m-0 mb-8 text-base leading-relaxed text-gray-600">
							Confirm this address so we can reach you about your Kutumb account.
						</Text>

						<Section className="mb-8 text-center">
							<Button
								href={verifyLink}
								className="bg-brand box-border block w-full rounded-md px-6 py-3 text-center text-sm font-medium text-white no-underline"
							>
								Verify email
							</Button>
						</Section>

						<Text className="m-0 mb-6 text-sm break-all text-muted">{verifyLink}</Text>

						<Hr className="m-0 mb-6 border-t border-solid border-gray-200" />

						<Text className="m-0 text-sm leading-relaxed text-muted">
							This link expires in 1 hour. If you didn't create a Kutumb account, you can ignore
							this email.
						</Text>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
}

VerifyEmail.PreviewProps = {
	verifyLink: "https://example.com/api/auth/verify-email?token=abc123&callbackURL=%2F",
} satisfies VerifyEmailProps;
