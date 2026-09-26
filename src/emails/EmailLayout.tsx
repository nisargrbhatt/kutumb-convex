import type { ReactNode } from "react";
import {
	Body,
	Container,
	Head,
	Hr,
	Html,
	Img,
	Link,
	Preview,
	Section,
	Tailwind,
	Text,
	pixelBasedPreset,
} from "@react-email/components";
import { EMAIL_CONFIG } from "../lib/common";

/** App palette (`src/styles.css` light theme, oklch → hex) — email clients don't do oklch/vars. */
export const EMAIL_TOKENS = {
	primary: "#bb4d00",
	"primary-foreground": "#fffbeb",
	foreground: "#0c0a09",
	"muted-foreground": "#7c6d67",
	muted: "#f3f1f1",
	border: "#e8e4e3",
	background: "#fbfaf9",
} as const;

interface EmailLayoutProps {
	/** Inbox preview line. */
	preview: string;
	/** Org the email concerns, shown in the footer next to the app name. */
	organizationName?: string;
	children: ReactNode;
}

/** Shared shell: brand header, card body, footer. Templates supply body copy only. */
export function EmailLayout({ preview, organizationName, children }: EmailLayoutProps) {
	return (
		<Html lang="en">
			<Tailwind
				config={{ presets: [pixelBasedPreset], theme: { extend: { colors: EMAIL_TOKENS } } }}
			>
				<Head />
				<Body className="mx-auto bg-background font-sans text-foreground">
					<Preview>{preview}</Preview>
					<Container className="mx-auto my-12 max-w-xl">
						<Section className="mb-6 text-center">
							<Link href={EMAIL_CONFIG.appUrl} className="text-foreground no-underline">
								<Img
									src={`${EMAIL_CONFIG.appUrl}/favicon.png`}
									width="40"
									height="40"
									alt={`${EMAIL_CONFIG.appName} logo`}
									className="mx-auto mb-2 rounded-full"
								/>
								<Text className="m-0 text-lg font-semibold tracking-tight">
									{EMAIL_CONFIG.appName}
								</Text>
							</Link>
						</Section>
						<Section className="rounded-lg border border-solid border-border bg-white p-8">
							{children}
						</Section>
						<Hr className="my-6 border-t border-solid border-border" />
						<Text className="m-0 text-center text-xs leading-relaxed text-muted-foreground">
							{organizationName ? `${organizationName} · ` : ""}
							{EMAIL_CONFIG.appName} —{" "}
							<Link href={EMAIL_CONFIG.appUrl} className="text-muted-foreground underline">
								{EMAIL_CONFIG.appUrl.replace(/^https?:\/\//, "")}
							</Link>
						</Text>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
}

/** Full-width primary CTA used by every template. */
export const emailButtonClass =
	"box-border block w-full rounded-md bg-primary px-6 py-3 text-center text-sm font-medium text-primary-foreground no-underline";
