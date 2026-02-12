import { CommunityLayout } from "@/components/CommunityLayout/CommunityLayout";
import { getOrganizationContextQuery } from "@/query/organization";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/community/$slug/_community")({
	beforeLoad: async ({ context, params }) => {
		await context.queryClient.ensureQueryData(getOrganizationContextQuery({ slug: params.slug }));
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
	loader: async ({ params, location }) => {
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
	component: CommunityLayoutComponent,
});

function CommunityLayoutComponent() {
	const { slug } = Route.useParams();

	return <CommunityLayout slug={slug} />;
}
