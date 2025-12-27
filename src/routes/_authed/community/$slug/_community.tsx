import { getOrganizationContext } from "@/api/organization";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/community/$slug/_community")({
	beforeLoad: async ({ params }) => {
		const orgContext = await getOrganizationContext({
			data: {
				slug: params.slug,
			},
		});

		return { organization: orgContext };
	},
	errorComponent: ({ error }) => {
		if (error.message === "No organization found" || error.message === "Organization not found") {
			return (
				<div className="flex items-center justify-center p-12">
					<Link to="/community/pick">Unknown Org, Please pick correct one</Link>
				</div>
			);
		}

		throw error;
	},
	loader: ({ params, location }) => {
		if (
			location.pathname === `/community/${params.slug}` ||
			location.pathname === `/community/${params.slug}/`
		) {
			throw redirect({
				to: "/community/$slug/dashboard",
				params: {
					slug: params.slug,
				},
			});
		}
	},
});
