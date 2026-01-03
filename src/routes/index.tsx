import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { Fragment } from "react";
import HeroImage from "@/assets/hero.png";
import { ClipboardList, Network, Share } from "lucide-react";
import { RootLayout } from "@/components/RootLayout";

export const Route = createFileRoute("/")({
	component: App,
});

interface HeroProps {
	badge?: string;
	heading: string;
	imageSrc?: string;
	imageAlt?: string;
	features?: Array<{
		icon: React.ReactNode;
		title: string;
		description: string;
	}>;
	className?: string;
}

function Hero({ badge, heading, imageSrc, imageAlt, features, className }: HeroProps) {
	return (
		<section className={cn("py-20", className)}>
			<div className="container mx-auto overflow-hidden">
				<div className="mb-10 flex flex-col items-center gap-6 text-center">
					<Badge variant="outline">{badge}</Badge>
					<h1 className="text-4xl font-semibold lg:text-5xl">{heading}</h1>
				</div>
				<div className="relative mx-auto max-w-5xl">
					<img
						src={imageSrc}
						alt={imageAlt}
						className="aspect-video max-h-125 w-full rounded-xl object-cover"
						loading="lazy"
						decoding="async"
					/>
					<div className="absolute inset-0 bg-linear-to-t from-background via-transparent to-transparent"></div>
					<div className="absolute -top-28 -right-28 -z-10 aspect-video h-72 w-96 mask-[radial-gradient(ellipse_50%_50%_at_50%_50%,#000_20%,transparent_100%)] bg-size-[12px_12px] opacity-40 sm:bg-[radial-gradient(hsl(var(--muted-foreground))_1px,transparent_1px)]"></div>
					<div className="absolute -top-28 -left-28 -z-10 aspect-video h-72 w-96 mask-[radial-gradient(ellipse_50%_50%_at_50%_50%,#000_20%,transparent_100%)] bg-size-[12px_12px] opacity-40 sm:bg-[radial-gradient(hsl(var(--muted-foreground))_1px,transparent_1px)]"></div>
				</div>
				<div className="mx-auto mt-10 flex max-w-5xl flex-col md:flex-row">
					{features?.map((feature, index) => (
						<Fragment key={feature.title}>
							{index > 0 && (
								<Separator
									orientation="vertical"
									className="mx-6 hidden h-auto w-0.5 bg-linear-to-b from-muted via-transparent to-muted md:block"
								/>
							)}
							<div key={index} className="flex grow basis-0 flex-col rounded-md bg-background p-4">
								<div className="mb-6 flex size-10 items-center justify-center rounded-full bg-background drop-shadow-lg">
									{feature.icon}
								</div>
								<h3 className="mb-2 font-semibold">{feature.title}</h3>
								<p className="text-sm text-muted-foreground">{feature.description}</p>
							</div>
						</Fragment>
					))}
				</div>
			</div>
		</section>
	);
}

function App() {
	return (
		<RootLayout>
			<div className="">
				<Hero
					badge="Currently Building"
					heading="Kutumb - Connect with your community"
					imageSrc={HeroImage}
					imageAlt="Kutumb Hero"
					features={[
						{
							title: "Directory",
							description:
								"Manage your community directory, see and manage who are in your community",
							icon: <ClipboardList />,
						},
						{
							title: "Relationship Graph",
							description: "See who is in your community and how they are connected",
							icon: <Network />,
						},
						{
							title: "Memories",
							description: "Share memories with your community",
							icon: <Share />,
						},
					]}
				/>
			</div>
		</RootLayout>
	);
}
