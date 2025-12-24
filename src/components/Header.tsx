import { Link, useNavigate } from "@tanstack/react-router";
import Logo from "@/assets/favicon.png";
import { authClient } from "@/lib/auth-client";
import { Spinner } from "./ui/spinner";
import { Button } from "./ui/button";

export default function Header() {
	const { isPending, isRefetching, data } = authClient.useSession();
	const navigate = useNavigate();

	return (
		<header className="w-full border-b border-gray-200 px-1">
			<div className="container mx-auto">
				<nav className="flex items-center justify-between py-2 lg:flex">
					<div>
						<Link to={"/"} className="flex items-center justify-start gap-1">
							<img src={Logo} alt="Kutumb Logo" className="h-8 w-auto" />
							<span className="font-medium">Kutumb</span>
						</Link>
					</div>
					<div>
						{isPending || isRefetching ? (
							<Spinner />
						) : !data ? (
							<Link to={"/login"}>
								<Button variant={"default"} size="sm">
									Login
								</Button>
							</Link>
						) : (
							<Button
								variant={"outline"}
								size="sm"
								onClick={async () => {
									await authClient.signOut();
									navigate({
										to: "/",
									});
								}}
							>
								Logout
							</Button>
						)}
					</div>
				</nav>
			</div>
		</header>
	);
}
