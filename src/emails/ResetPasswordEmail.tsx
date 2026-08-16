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

interface ResetPasswordEmailProps {
	resetLink: string;
}

export default function ResetPasswordEmail({ resetLink }: ResetPasswordEmailProps) {
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
					<Preview>Reset your Kutumb password</Preview>
					<Container className="mx-auto mt-12 mb-12 max-w-xl rounded-lg border border-solid border-gray-100 bg-white p-8 shadow-sm">
						<Heading className="text-brand m-0 mb-6 text-2xl font-semibold tracking-tight">
							Reset your password
						</Heading>

						<Text className="m-0 mb-8 text-base leading-relaxed text-gray-600">
							Someone asked to reset the password for this account. If that was you, choose a new
							one.
						</Text>

						<Section className="mb-8 text-center">
							<Button
								href={resetLink}
								className="bg-brand box-border block w-full rounded-md px-6 py-3 text-center text-sm font-medium text-white no-underline"
							>
								Reset password
							</Button>
						</Section>

						<Text className="m-0 mb-6 text-sm break-all text-muted">{resetLink}</Text>

						<Hr className="m-0 mb-6 border-t border-solid border-gray-200" />

						<Text className="m-0 text-sm leading-relaxed text-muted">
							This link expires in 1 hour. If you didn't ask for this, you can safely ignore this
							email — your password won't change.
						</Text>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
}

ResetPasswordEmail.PreviewProps = {
	resetLink: "https://example.com/api/auth/reset-password/abc123?callbackURL=%2Freset-password",
} satisfies ResetPasswordEmailProps;
