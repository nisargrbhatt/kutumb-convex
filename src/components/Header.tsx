import { Link } from "@tanstack/react-router";
import Logo from "@/assets/favicon.png";
import { ExternalLink } from "lucide-react";
import { Button } from "./ui/button";

export default function Header() {
	return (
		<header className="w-full border-b border-gray-200 px-1">
			<div className="container mx-auto">
				<nav className="flex items-center justify-between py-2 lg:flex">
					<div>
						<Link to={"/"} className="flex items-center justify-start gap-1">
							<img src={Logo} alt="Kutumb Logo" className="h-8 w-auto rounded-full" />
							<span className="font-medium">Kutumb</span>
						</Link>
					</div>
					<div>
						<Link to={"/community/pick"}>
							<Button variant={"link"} size="sm">
								Console <ExternalLink className="h-2 w-2" />
							</Button>
						</Link>
					</div>
				</nav>
			</div>
		</header>
	);
}
