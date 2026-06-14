import { createFileRoute } from "@tanstack/react-router";

const SITE_URL = "https://kutumb.nisargbhatt.org";
const PAGE_URL = `${SITE_URL}/term-of-service`;
const EFFECTIVE_DATE = "June 14, 2026";

export const Route = createFileRoute("/(public)/term-of-service/")({
	head: () => ({
		meta: [
			{ title: "Terms of Service — Kutumb" },
			{
				name: "description",
				content: "The terms that govern your use of the Kutumb community-management platform.",
			},
			{ name: "robots", content: "index, follow" },
			{ property: "og:type", content: "website" },
			{ property: "og:url", content: PAGE_URL },
			{ property: "og:title", content: "Terms of Service — Kutumb" },
			{
				property: "og:description",
				content: "The terms that govern your use of the Kutumb community-management platform.",
			},
			{ name: "twitter:card", content: "summary" },
			{ name: "twitter:title", content: "Terms of Service — Kutumb" },
		],
		links: [{ rel: "canonical", href: PAGE_URL }],
	}),
	component: TermsOfServicePage,
});

function TermsOfServicePage() {
	return (
		<section className="container mx-auto max-w-3xl px-4 py-16 md:py-24">
			<h1 className="mb-2 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
				Terms of Service
			</h1>
			<p className="mb-6 text-sm text-muted-foreground">Last updated: {EFFECTIVE_DATE}</p>

			<div className="mb-10 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400">
				This is a template document and must be reviewed by legal counsel before production use.
			</div>

			<div className="space-y-10 text-muted-foreground">
				<section className="space-y-3">
					<h2 className="text-2xl font-bold text-foreground">1. Acceptance of terms</h2>
					<p>
						These Terms of Service ("Terms") govern your access to and use of the Kutumb platform
						(the "Service"). By creating an account or using the Service, you agree to these Terms.
						If you do not agree, do not use the Service.
					</p>
				</section>

				<section className="space-y-3">
					<h2 className="text-2xl font-bold text-foreground">2. Accounts &amp; eligibility</h2>
					<p>
						You must provide accurate information when creating an account and are responsible for
						maintaining the security of your credentials and for all activity under your account.
						You must be old enough to form a binding contract in your jurisdiction.
					</p>
				</section>

				<section className="space-y-3">
					<h2 className="text-2xl font-bold text-foreground">3. Acceptable use</h2>
					<p>You agree not to:</p>
					<ul className="list-disc space-y-2 pl-6">
						<li>Use the Service for any unlawful purpose or in violation of others' rights.</li>
						<li>Upload content you do not have the right to share.</li>
						<li>
							Attempt to disrupt, reverse-engineer, or gain unauthorized access to the Service.
						</li>
						<li>Misuse other members' personal data accessed through the Service.</li>
					</ul>
				</section>

				<section className="space-y-3">
					<h2 className="text-2xl font-bold text-foreground">4. Subscriptions &amp; billing</h2>
					<p>
						Paid features are billed through our payment provider on a subscription basis. Fees are
						charged in advance and are non-refundable except where required by law. You can manage
						or cancel your subscription through your account; cancellation takes effect at the end
						of the current billing period.
					</p>
				</section>

				<section className="space-y-3">
					<h2 className="text-2xl font-bold text-foreground">5. Your content</h2>
					<p>
						You retain ownership of the content you submit. You grant us a limited license to host,
						store, and display that content solely to operate and provide the Service. You are
						responsible for the content you and your community members upload.
					</p>
				</section>

				<section className="space-y-3">
					<h2 className="text-2xl font-bold text-foreground">6. Intellectual property</h2>
					<p>
						The Service, including its software, design, and trademarks, is owned by us and
						protected by applicable laws. These Terms do not grant you any right to our intellectual
						property except as necessary to use the Service.
					</p>
				</section>

				<section className="space-y-3">
					<h2 className="text-2xl font-bold text-foreground">7. Termination</h2>
					<p>
						You may stop using the Service at any time. We may suspend or terminate your access if
						you violate these Terms or to protect the Service. Upon termination, your right to use
						the Service ceases.
					</p>
				</section>

				<section className="space-y-3">
					<h2 className="text-2xl font-bold text-foreground">8. Disclaimers</h2>
					<p>
						The Service is provided "as is" and "as available" without warranties of any kind,
						whether express or implied, including fitness for a particular purpose and
						non-infringement, to the maximum extent permitted by law.
					</p>
				</section>

				<section className="space-y-3">
					<h2 className="text-2xl font-bold text-foreground">9. Limitation of liability</h2>
					<p>
						To the maximum extent permitted by law, we will not be liable for any indirect,
						incidental, special, or consequential damages, or for any loss of data, arising out of
						your use of the Service.
					</p>
				</section>

				<section className="space-y-3">
					<h2 className="text-2xl font-bold text-foreground">10. Governing law</h2>
					<p>
						These Terms are governed by the laws of the applicable jurisdiction.
						{/* TODO: specify governing law / jurisdiction once the legal entity is established */}
					</p>
				</section>

				<section className="space-y-3">
					<h2 className="text-2xl font-bold text-foreground">11. Changes to these terms</h2>
					<p>
						We may update these Terms from time to time. Continued use of the Service after changes
						take effect constitutes acceptance of the revised Terms.
					</p>
				</section>

				<section className="space-y-3">
					<h2 className="text-2xl font-bold text-foreground">12. Contact us</h2>
					<p>
						Questions about these Terms? Reach out to us through the app.
						{/* TODO: add contact email once available */}
					</p>
				</section>
			</div>
		</section>
	);
}
