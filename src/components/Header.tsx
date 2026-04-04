import { Link } from "@tanstack/react-router";
import Logo from "@/assets/favicon.png";
import { Button } from "./ui/button";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export default function Header() {
	const { data: session } = authClient.useSession();

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
					<div className="flex items-center justify-end gap-1">
						<Link to={"/dashboard"}>
							<Button variant={"outline"} size="sm">
								Console
							</Button>
						</Link>
						{session ? (
							<Button
								type="button"
								variant={"ghost"}
								size={"icon-sm"}
								title="Logout"
								onClick={async () => {
									await authClient.signOut();
									window.location.href = new URL("/login", window.location.origin).toString();
								}}
							>
								<LogOut />
							</Button>
						) : null}
					</div>
				</nav>
			</div>
		</header>
	);
}
