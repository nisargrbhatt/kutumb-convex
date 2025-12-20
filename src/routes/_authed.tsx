import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed")({
	beforeLoad: ({ context }) => {
		if (!context?.userId) {
			throw new Error("Not authenticated");
		}
	},
	errorComponent: ({ error }) => {
		if (error.message === "Not authenticated") {
			return (
				<div className="flex items-center justify-center p-12">
					<Link to="/login">Sign in</Link>
				</div>
			);
		}

		throw error;
	},
});
