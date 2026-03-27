import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Link } from "@tanstack/react-router";
import { Zap } from "lucide-react";
import {
	IconBrandX as Twitter,
	IconBrandGithub as Github,
	IconBrandLinkedin as Linkedin,
} from "@tabler/icons-react";
import Logo from "@/assets/favicon.png";

export default function Footer() {
	return (
		<footer className="border-t border-border/40 bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/60">
			<div className="container mx-auto px-4 py-16">
				<div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
					{/* Brand Column */}
					<div className="lg:col-span-4">
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

					{/* Links Columns */}
					<div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-8">
						<div>
							<h3 className="mb-4 text-sm font-semibold tracking-wider text-foreground/90 uppercase">
								Product
							</h3>
							<ul className="space-y-3 text-muted-foreground">
								<li>
									<Link to="/" className="transition-colors hover:text-foreground">
										Directory
									</Link>
								</li>
								<li>
									<Link to="/" className="transition-colors hover:text-foreground">
										Graph
									</Link>
								</li>
								<li>
									<Link to="/" className="transition-colors hover:text-foreground">
										Memories
									</Link>
								</li>
								<li>
									<Link to="/" className="transition-colors hover:text-foreground">
										Changelog
									</Link>
								</li>
							</ul>
						</div>
						<div>
							<h3 className="mb-4 text-sm font-semibold tracking-wider text-foreground/90 uppercase">
								Company
							</h3>
							<ul className="space-y-3 text-muted-foreground">
								<li>
									<Link to="/" className="transition-colors hover:text-foreground">
										About
									</Link>
								</li>
								<li>
									<Link to="/" className="transition-colors hover:text-foreground">
										Blog
									</Link>
								</li>
								<li>
									<Link to="/" className="transition-colors hover:text-foreground">
										Careers
									</Link>
								</li>
								<li>
									<Link to="/" className="transition-colors hover:text-foreground">
										Contact
									</Link>
								</li>
							</ul>
						</div>
						<div className="col-span-2 sm:col-span-1">
							<h3 className="mb-4 text-sm font-semibold tracking-wider text-foreground/90 uppercase">
								Stay Connected
							</h3>
							<p className="mb-4 text-sm text-muted-foreground">
								Subscribe to our newsletter for the latest updates.
							</p>
							<div className="flex flex-col gap-2">
								<Input type="email" placeholder="Enter your email" className="bg-background" />
								<Button size="sm" className="w-full">
									Subscribe
								</Button>
							</div>
						</div>
					</div>
				</div>

				<Separator className="my-8 lg:my-12" />

				<div className="flex flex-col items-center justify-between gap-4 md:flex-row">
					<p className="text-sm text-muted-foreground">
						&copy; {new Date().getFullYear()} Kutumb Inc. All rights reserved.
					</p>
					<div className="flex gap-6 text-sm text-muted-foreground">
						<Link to="/" className="transition-colors hover:text-foreground">
							Privacy Policy
						</Link>
						<Link to="/" className="transition-colors hover:text-foreground">
							Terms of Service
						</Link>
						<Link to="/" className="transition-colors hover:text-foreground">
							Cookie Policy
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
