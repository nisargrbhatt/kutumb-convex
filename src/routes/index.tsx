import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Globe, Heart, Shield, Users, Zap } from "lucide-react";
import { RootLayout } from "@/components/RootLayout";

export const Route = createFileRoute("/")({
	component: App,
	beforeLoad: () => ({ CF_URL: process.env.CF_PAGES_URL }),
	loader: ({ context }) => context.CF_URL,
});

/* -------------------------------------------------------------------------- */
/*                                Hero Section                                */
/* -------------------------------------------------------------------------- */

function Hero() {
	return (
		<section className="relative overflow-hidden pt-24 pb-32 md:pt-32 md:pb-48">
			{/* Animated Background Mesh */}
			<div className="absolute inset-0 -z-10 h-full w-full bg-background opacity-20 [background:radial-gradient(125%_125%_at_50%_10%,#000_40%,#63e_100%)] dark:opacity-30" />
			<div className="absolute inset-0 -z-10 h-full w-full bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] bg-[size:24px_24px]" />

			<div className="container mx-auto px-4 text-center">
				<Badge
					variant="outline"
					className="animate-fade-in mb-6 border-primary/20 bg-primary/5 px-3 py-1 text-sm text-primary backdrop-blur-md"
				>
					Currently Building v1.0
				</Badge>

				<h1 className="mx-auto mb-6 max-w-4xl text-5xl font-bold tracking-tight text-balance text-foreground sm:text-7xl">
					Connect with your{" "}
					<span className="bg-gradient-to-r from-primary to-violet-500 bg-clip-text text-transparent">
						Community
					</span>{" "}
					like never before.
				</h1>

				<p className="mx-auto mb-10 max-w-2xl text-lg text-balance text-muted-foreground md:text-xl">
					Kutumb brings people together. Manage your directory, visualize relationships, and share
					memories in one beautiful space.
				</p>

				<div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
					<Button
						size="lg"
						className="group rounded-full px-8 text-base font-medium shadow-lg shadow-primary/20 transition-all hover:shadow-primary/40"
					>
						Get Started
						<ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
					</Button>
					<Button variant="ghost" size="lg" className="rounded-full px-8 text-base">
						Learn More
					</Button>
				</div>
			</div>
		</section>
	);
}

/* -------------------------------------------------------------------------- */
/*                                Bento Grid                                  */
/* -------------------------------------------------------------------------- */

const features = [
	{
		title: "Community Directory",
		description:
			"A living, breathing directory of all your members. Search, filter, and connect in seconds.",
		icon: <Users className="h-6 w-6" />,
		className: "md:col-span-2",
		bg: "bg-blue-500/10",
	},
	{
		title: "Relationship Graph",
		description: "Visualize how everyone knows each other. Discover hidden connections.",
		icon: <Globe className="h-6 w-6" />,
		className: "md:col-span-1",
		bg: "bg-violet-500/10",
	},
	{
		title: "Shared Memories",
		description: "Securely store and share photos, events, and milestones with your community.",
		icon: <Heart className="h-6 w-6" />,
		className: "md:col-span-1",
		bg: "bg-rose-500/10",
	},
	{
		title: "Privacy First",
		description: "Your data stays with you. Granular controls for what you share and with whom.",
		icon: <Shield className="h-6 w-6" />,
		className: "md:col-span-2",
		bg: "bg-emerald-500/10",
	},
];

function FeatureGrid() {
	return (
		<section className="container mx-auto px-4 py-24">
			<div className="mb-16 text-center">
				<h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
					Everything you need
				</h2>
				<p className="mt-4 text-muted-foreground">
					Powertools for community management, built with love.
				</p>
			</div>

			<div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-8">
				{features.map((feature, i) => (
					<div
						key={i}
						className={cn(
							"group relative overflow-hidden rounded-3xl border border-border/50 bg-background/50 p-8 transition-all hover:border-primary/20 hover:shadow-2xl hover:shadow-primary/5",
							feature.className
						)}
					>
						<div className={cn("mb-6 inline-flex rounded-2xl p-3 text-foreground", feature.bg)}>
							{feature.icon}
						</div>
						<h3 className="mb-3 text-xl font-bold text-foreground">{feature.title}</h3>
						<p className="text-muted-foreground">{feature.description}</p>

						{/* Hover Gradient Effect */}
						<div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
					</div>
				))}
			</div>
		</section>
	);
}

/* -------------------------------------------------------------------------- */
/*                                Main App                                    */
/* -------------------------------------------------------------------------- */

function App() {
	console.log(Route.useLoaderData());
	return (
		<RootLayout>
			<div className="min-h-screen bg-background text-foreground">
				<Hero />
				<FeatureGrid />

				{/* CTA Section */}
				<section className="border-t border-border/40 bg-muted/20 py-24">
					<div className="container mx-auto px-4 text-center">
						<div className="mx-auto max-w-2xl">
							<div className="mb-6 flex justify-center">
								<div className="rounded-full bg-primary/10 p-3">
									<Zap className="h-8 w-8 text-primary" />
								</div>
							</div>
							<h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground">
								Ready to get started?
							</h2>
							<p className="mb-8 text-muted-foreground">
								Join thousands of communities already using Kutumb to stay connected.
							</p>
							<Button size="lg" className="rounded-full px-8 font-medium">
								Join Now
							</Button>
						</div>
					</div>
				</section>
			</div>
		</RootLayout>
	);
}
