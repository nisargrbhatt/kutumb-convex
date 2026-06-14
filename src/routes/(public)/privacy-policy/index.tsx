import { createFileRoute } from "@tanstack/react-router";

const SITE_URL = "https://kutumb.nisargbhatt.org";
const PAGE_URL = `${SITE_URL}/privacy-policy`;
const EFFECTIVE_DATE = "June 14, 2026";

export const Route = createFileRoute("/(public)/privacy-policy/")({
	head: () => ({
		meta: [
			{ title: "Privacy Policy — Kutumb" },
			{
				name: "description",
				content: "How Kutumb collects, uses, and protects your personal data.",
			},
			{ name: "robots", content: "index, follow" },
			{ property: "og:type", content: "website" },
			{ property: "og:url", content: PAGE_URL },
			{ property: "og:title", content: "Privacy Policy — Kutumb" },
			{
				property: "og:description",
				content: "How Kutumb collects, uses, and protects your personal data.",
			},
			{ name: "twitter:card", content: "summary" },
			{ name: "twitter:title", content: "Privacy Policy — Kutumb" },
		],
		links: [{ rel: "canonical", href: PAGE_URL }],
	}),
	component: PrivacyPolicyPage,
});

function PrivacyPolicyPage() {
	return (
		<section className="container mx-auto max-w-3xl px-4 py-16 md:py-24">
			<h1 className="mb-2 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
				Privacy Policy
			</h1>
			<p className="mb-6 text-sm text-muted-foreground">Last updated: {EFFECTIVE_DATE}</p>

			<div className="mb-10 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400">
				This is a template document provided for transparency and must be reviewed by legal counsel
				before production use.
			</div>

			<div className="space-y-10 text-muted-foreground">
				<section className="space-y-3">
					<p>
						This Privacy Policy explains how Kutumb ("we", "us") collects, uses, and protects
						information when you use our community-management platform (the "Service"). By using the
						Service you agree to the practices described here.
					</p>
				</section>

				<section className="space-y-3">
					<h2 className="text-2xl font-bold text-foreground">1. Information we collect</h2>
					<ul className="list-disc space-y-2 pl-6">
						<li>
							<span className="font-medium text-foreground">Account information</span> — your name,
							email address, and authentication credentials when you sign up.
						</li>
						<li>
							<span className="font-medium text-foreground">Organization &amp; community data</span>{" "}
							— the communities you create or join, member roles, and related settings.
						</li>
						<li>
							<span className="font-medium text-foreground">Profile &amp; content</span> — community
							member profiles, addresses, relationships, photos, and memories you choose to add.
						</li>
						<li>
							<span className="font-medium text-foreground">Billing data</span> — subscription and
							payment details, processed by our payment provider; we store a customer reference, not
							your full card details.
						</li>
						<li>
							<span className="font-medium text-foreground">Usage &amp; device data</span> —
							analytics about how you interact with the Service, collected to improve it.
						</li>
					</ul>
				</section>

				<section className="space-y-3">
					<h2 className="text-2xl font-bold text-foreground">2. How we use your information</h2>
					<ul className="list-disc space-y-2 pl-6">
						<li>To provide, maintain, and improve the Service.</li>
						<li>To authenticate you and secure your account.</li>
						<li>To process subscriptions and payments.</li>
						<li>To communicate with you about your account, including transactional emails.</li>
						<li>To understand usage and improve features and performance.</li>
					</ul>
				</section>

				<section className="space-y-3">
					<h2 className="text-2xl font-bold text-foreground">3. Service providers</h2>
					<p>We share data with trusted providers only as needed to run the Service:</p>
					<ul className="list-disc space-y-2 pl-6">
						<li>
							<span className="font-medium text-foreground">Cloudflare</span> — hosting, data
							storage, and caching.
						</li>
						<li>
							<span className="font-medium text-foreground">Polar</span> — subscription billing and
							payments.
						</li>
						<li>
							<span className="font-medium text-foreground">PostHog</span> — product analytics.
						</li>
						<li>
							<span className="font-medium text-foreground">Resend</span> — transactional email
							delivery.
						</li>
					</ul>
				</section>

				<section className="space-y-3">
					<h2 className="text-2xl font-bold text-foreground">4. Cookies &amp; analytics</h2>
					<p>
						We use cookies and similar technologies to keep you signed in and to measure product
						usage through our analytics provider. You can control cookies through your browser
						settings; disabling them may affect some functionality.
					</p>
				</section>

				<section className="space-y-3">
					<h2 className="text-2xl font-bold text-foreground">5. Data retention</h2>
					<p>
						We retain your information for as long as your account is active or as needed to provide
						the Service, comply with legal obligations, resolve disputes, and enforce our
						agreements.
					</p>
				</section>

				<section className="space-y-3">
					<h2 className="text-2xl font-bold text-foreground">6. Your rights</h2>
					<p>
						Depending on your location, you may have the right to access, correct, export, or delete
						your personal data, and to object to or restrict certain processing. To exercise these
						rights, contact us.
					</p>
				</section>

				<section className="space-y-3">
					<h2 className="text-2xl font-bold text-foreground">7. Security</h2>
					<p>
						We use reasonable technical and organizational measures to protect your data. No method
						of transmission or storage is completely secure, and we cannot guarantee absolute
						security.
					</p>
				</section>

				<section className="space-y-3">
					<h2 className="text-2xl font-bold text-foreground">8. Children's privacy</h2>
					<p>
						The Service is not directed to children under 13 (or the minimum age required in your
						jurisdiction), and we do not knowingly collect their personal data.
					</p>
				</section>

				<section className="space-y-3">
					<h2 className="text-2xl font-bold text-foreground">9. Changes to this policy</h2>
					<p>
						We may update this Privacy Policy from time to time. We will post the updated version
						here and revise the "Last updated" date above.
					</p>
				</section>

				<section className="space-y-3">
					<h2 className="text-2xl font-bold text-foreground">10. Contact us</h2>
					<p>
						If you have questions about this Privacy Policy, please reach out to us through the app.
						{/* TODO: add privacy contact email once available */}
					</p>
				</section>
			</div>
		</section>
	);
}
