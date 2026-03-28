import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/onboarding/create")({
	component: RouteComponent,
});

function RouteComponent() {
	const { data: currentOrg } = authClient.useActiveOrganization();
	const { data: organizations } = authClient.useListOrganizations();

	const createNewOrg = async () => {
		const result = await authClient.organization.create({
			name: `New ${Date.now()}`,
			slug: `new-${Date.now()}`,
			keepCurrentActiveOrganization: false,
			metadata: {},
		});

		console.log(result.data?.id);
	};

	return (
		<div>
			<h1>Create Org</h1>
			<Button type="button" onClick={createNewOrg}>
				Create Random Org
			</Button>
			{!currentOrg ? (
				<p>No Active Org Found</p>
			) : (
				<p>
					Active Org: {currentOrg.name}({currentOrg.members?.at(0)?.role})
				</p>
			)}
			{!organizations || organizations?.length < 1 ? <p>No Org Found</p> : null}
			<ol>
				{organizations?.map((org) => (
					<li key={org.id}>
						{org.name} ({org.slug})
					</li>
				))}
			</ol>
		</div>
	);
}
