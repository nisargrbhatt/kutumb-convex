import { Badge } from "@/components/ui/badge";
import { createFileRoute } from "@tanstack/react-router";
import { Globe, Heart, Shield, Users } from "lucide-react";

const SITE_URL = "https://kutumb.nisargbhatt.org";
const PAGE_URL = `${SITE_URL}/about`;

export const Route = createFileRoute("/(public)/about/")({
	head: () => ({
		meta: [
			{ title: "About — Kutumb" },
			{
				name: "description",
				content:
					"Kutumb is a privacy-first community-management platform. Learn what we're building and why.",
			},
			{ property: "og:type", content: "website" },
			{ property: "og:url", content: PAGE_URL },
			{ property: "og:title", content: "About — Kutumb" },
			{
				property: "og:description",
				content: "Kutumb is a privacy-first community-management platform.",
			},
			{ name: "twitter:card", content: "summary" },
			{ name: "twitter:title", content: "About — Kutumb" },
			{
				name: "twitter:description",
				content: "Kutumb is a privacy-first community-management platform.",
			},
		],
		links: [{ rel: "canonical", href: PAGE_URL }],
	}),
	component: AboutPage,
});

const values = [
	{
		title: "Bring people together",
		description:
			"A living member directory so everyone in your community is easy to find and connect with.",
		icon: <Users className="h-5 w-5" />,
	},
	{
		title: "See the connections",
		description: "Visualize how members relate to one another and discover hidden links.",
		icon: <Globe className="h-5 w-5" />,
	},
	{
		title: "Keep the memories",
		description: "Securely store and share photos, events, and milestones that matter.",
		icon: <Heart className="h-5 w-5" />,
	},
	{
		title: "Privacy first",
		description: "Your data stays yours, with granular control over what you share and with whom.",
		icon: <Shield className="h-5 w-5" />,
	},
];

function AboutPage() {
	return (
		<section className="container mx-auto max-w-3xl px-4 py-16 md:py-24">
			<Badge variant="outline" className="mb-6 border-primary/20 bg-primary/5 text-primary">
				Currently Building v1.0
			</Badge>

			<h1 className="mb-6 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
				About Kutumb
			</h1>

			<div className="space-y-4 text-lg text-muted-foreground">
				<p>
					Kutumb is the operating system for your community. We help groups stay connected by
					bringing the member directory, relationships, and shared memories into one simple,
					beautiful place.
				</p>
				<p>
					We believe communities thrive when people can easily find each other, understand how
					they're connected, and preserve the moments they share — without giving up control of
					their data.
				</p>
			</div>

			<h2 className="mt-14 mb-6 text-2xl font-bold tracking-tight text-foreground">
				What we're building
			</h2>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				{values.map((value) => (
					<div
						key={value.title}
						className="rounded-2xl border border-border/50 bg-background/50 p-6"
					>
						<div className="mb-4 inline-flex rounded-xl bg-primary/10 p-2.5 text-primary">
							{value.icon}
						</div>
						<h3 className="mb-2 font-semibold text-foreground">{value.title}</h3>
						<p className="text-sm text-muted-foreground">{value.description}</p>
					</div>
				))}
			</div>

			<h2 className="mt-14 mb-4 text-2xl font-bold tracking-tight text-foreground">Get in touch</h2>
			<p className="text-muted-foreground">
				Questions, feedback, or partnership ideas? We'd love to hear from you — reach out to us
				through the app.
				{/* TODO: add public contact email once available */}
			</p>
		</section>
	);
}
