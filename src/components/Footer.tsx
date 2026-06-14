import { Separator } from "@/components/ui/separator";
import { Link } from "@tanstack/react-router";
import { Zap } from "lucide-react";
import {
	IconBrandX as Twitter,
	IconBrandGithub as Github,
	IconBrandLinkedin as Linkedin,
} from "@tabler/icons-react";
import Logo from "@/assets/favicon.png";

const navLinks = [
	{ label: "About", to: "/about" },
	{ label: "Privacy Policy", to: "/privacy-policy" },
	{ label: "Terms of Service", to: "/term-of-service" },
	{ label: "Console", to: "/dashboard" },
] as const;

export default function Footer() {
	return (
		<footer className="border-t border-border/40 bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/60">
			<div className="container mx-auto px-4 py-16">
				<div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
					{/* Brand Column */}
					<div className="lg:col-span-7">
						<Link to="/" className="mb-6 flex items-center gap-2">
							<img src={Logo} alt="Kutumb Logo" className="h-8 w-8 rounded-full" />
							<span className="text-xl font-bold tracking-tight">Kutumb</span>
						</Link>
						<p className="mb-6 max-w-sm text-balance text-muted-foreground">
							Empowering communities to connect, grow, and thrive together. The operating system for
							your community.
						</p>
						<div className="flex gap-4">
							<a
								href="https://x.com/nisarg_2001"
								target="_blank"
								rel="noreferrer"
								className="text-muted-foreground transition-colors hover:text-foreground"
							>
								<Twitter className="h-5 w-5" />
								<span className="sr-only">Twitter</span>
							</a>
							<a
								href="https://github.com/nisargrbhatt/kutumb-convex"
								target="_blank"
								rel="noreferrer"
								className="text-muted-foreground transition-colors hover:text-foreground"
							>
								<Github className="h-5 w-5" />
								<span className="sr-only">GitHub</span>
							</a>
							<a
								href="https://www.linkedin.com/in/nisarg-r-bhatt/"
								target="_blank"
								rel="noreferrer"
								className="text-muted-foreground transition-colors hover:text-foreground"
							>
								<Linkedin className="h-5 w-5" />
								<span className="sr-only">LinkedIn</span>
							</a>
						</div>
					</div>

					{/* Quick Links */}
					<div className="lg:col-span-5">
						<h3 className="mb-4 text-sm font-semibold tracking-wider text-foreground/90 uppercase">
							Quick Links
						</h3>
						<ul className="grid grid-cols-2 gap-3 text-muted-foreground">
							{navLinks.map((link) => (
								<li key={link.to}>
									<Link to={link.to} className="transition-colors hover:text-foreground">
										{link.label}
									</Link>
								</li>
							))}
						</ul>
					</div>
				</div>

				<Separator className="my-8 lg:my-12" />

				<div className="flex flex-col items-center justify-between gap-4 md:flex-row">
					<p className="text-sm text-muted-foreground">
						&copy; {new Date().getFullYear()} Kutumb. All rights reserved.
					</p>
					<div className="flex gap-6 text-sm text-muted-foreground">
						<Link to="/privacy-policy" className="transition-colors hover:text-foreground">
							Privacy Policy
						</Link>
						<Link to="/term-of-service" className="transition-colors hover:text-foreground">
							Terms of Service
						</Link>
					</div>
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<span>Made with</span>
						<Zap className="h-4 w-4 fill-primary text-primary" />
						<span>by the community</span>
					</div>
				</div>
			</div>
		</footer>
	);
}
