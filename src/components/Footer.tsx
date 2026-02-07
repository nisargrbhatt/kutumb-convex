import { cn } from "@/lib/utils";
import Logo from "@/assets/favicon.png";
import { Link } from "@tanstack/react-router";

interface FooterProps {
	logo: {
		src: string;
		alt: string;
		title: string;
	};
	className?: string;
	tagline?: string;
	menuItems?: Array<{
		title: string;
		links: {
			text: string;
			url: string;
		}[];
	}>;
	copyright?: string;
	bottomLinks: {
		text: string;
		url: string;
	}[];
}

const FooterComponent = ({
	logo,
	className,
	tagline,
	menuItems,
	copyright,
	bottomLinks,
}: FooterProps) => (
	<section className={cn("px-1 py-4", className)}>
		<div className="container mx-auto">
			<footer>
				<div className="grid grid-cols-2 gap-8 md:grid-cols-6">
					<div className="col-span-2 mb-8 lg:mb-0">
						<div className="flex items-center gap-2 lg:justify-start">
							<Link to={"/"} className="flex items-center justify-start gap-1">
								<img src={logo.src} alt={logo.alt} className="h-8 w-auto rounded-full" loading="lazy" />
								<span className="font-medium">{logo.title}</span>
							</Link>
						</div>
						<p className="mt-4 font-normal">{tagline}</p>
					</div>
					{menuItems?.map((section, sectionIdx) => (
						<div key={sectionIdx}>
							<h3 className="mb-4 font-medium">{section.title}</h3>
							<ul className="space-y-4 text-muted-foreground">
								{section.links.map((link, linkIdx) => (
									<li key={linkIdx}>
										<a className="link" href={link.url}>
											{link.text}
										</a>
									</li>
								))}
							</ul>
						</div>
					))}
				</div>
				<div className="flex flex-col justify-between gap-4 pt-8 text-sm font-medium text-muted-foreground md:flex-row md:items-center">
					<p>{copyright}</p>
					<ul className="flex gap-4">
						{bottomLinks.map((link, linkIdx) => (
							<li key={linkIdx}>
								<Link className="link" to={link.url}>
									{link.text}
								</Link>
							</li>
						))}
					</ul>
				</div>
			</footer>
		</div>
	</section>
);

export default function Footer() {
	return (
		<FooterComponent
			logo={{
				title: "Kutumb",
				alt: "Kutumb Logo",
				src: Logo,
			}}
			copyright={`© ${new Date().getFullYear()} Kutumb. All rights reserved.`}
			bottomLinks={[
				{ text: "Terms and Conditions", url: "/terms-and-conditions" },
				{ text: "Privacy Policy", url: "/privacy-policy" },
			]}
			tagline="Connect with communities"
			menuItems={[
				{
					title: "Social",
					links: [
						{ text: "X (Twitter)", url: "https://x.com/nisarg_2001" },
						{ text: "LinkedIn", url: "https://www.linkedin.com/in/nisarg-r-bhatt/" },
						{ text: "Github", url: "https://github.com/nisargrbhatt/kutumb-convex" },
					],
				},
			]}
		/>
	);
}
