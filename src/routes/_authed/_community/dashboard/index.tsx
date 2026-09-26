import { PageHeader } from "@/components/CommunityLayout/PageHeader";
import { activeMemberCountQuery, myProfileQuery } from "@/queries/communityProfile";
import { myAddressesQuery } from "@/queries/communityAddress";
import {
	myIncomingRelationCountQuery,
	myOutgoingRelationCountQuery,
} from "@/queries/communityRelation";
import { CtaCard } from "@/components/dashboard/CtaCard";
import { StatCard } from "@/components/dashboard/StatCard";
import { authClient } from "@/lib/auth-client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownLeft, ArrowUpRight, MapPin, UserPlus, Users } from "lucide-react";

export const Route = createFileRoute("/_authed/_community/dashboard/")({
	loader: async ({ context }) => {
		const { queryClient: qc, organizationId: orgId } = context;
		await Promise.allSettled([
			qc.ensureQueryData(activeMemberCountQuery(orgId)),
			qc.ensureQueryData(myIncomingRelationCountQuery(orgId)),
			qc.ensureQueryData(myOutgoingRelationCountQuery(orgId)),
			qc.ensureQueryData(myProfileQuery(orgId)),
			qc.ensureQueryData(myAddressesQuery(orgId)),
		]);
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { data: activeOrg } = authClient.useActiveOrganization();

	const { organizationId: orgId } = Route.useRouteContext();
	const { data: memberCount } = useSuspenseQuery(activeMemberCountQuery(orgId));
	const { data: incomingCount } = useSuspenseQuery(myIncomingRelationCountQuery(orgId));
	const { data: outgoingCount } = useSuspenseQuery(myOutgoingRelationCountQuery(orgId));
	const { data: profile } = useSuspenseQuery(myProfileQuery(orgId));
	const { data: addresses } = useSuspenseQuery(myAddressesQuery(orgId));

	const hasProfile = profile !== null;
	const showAddRelationCta = hasProfile && incomingCount + outgoingCount === 0;
	const showAddAddressCta = hasProfile && addresses.length === 0;
	const showAnyCta = !hasProfile || showAddRelationCta || showAddAddressCta;

	return (
		<div className="flex h-full w-full flex-col items-start justify-start gap-4 p-2">
			<PageHeader />
			<h1 className="text-2xl font-semibold">Welcome to {activeOrg?.name}</h1>

			<div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				<StatCard title="Community Members" value={memberCount} icon={Users} />
				{hasProfile ? (
					<>
						<StatCard title="Incoming Relations" value={incomingCount} icon={ArrowDownLeft} />
						<StatCard title="Outgoing Relations" value={outgoingCount} icon={ArrowUpRight} />
					</>
				) : null}
			</div>

			{showAnyCta ? (
				<div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{!hasProfile ? (
						<CtaCard
							title="Complete your profile"
							description="Set up your community profile to connect with others."
							actionLabel="Create profile"
							to="/profile/info"
							icon={UserPlus}
						/>
					) : null}
					{showAddRelationCta ? (
						<CtaCard
							title="Add a relation"
							description="You have no relations yet. Add your first one."
							actionLabel="Add relation"
							to="/profile/relationships"
							icon={UserPlus}
						/>
					) : null}
					{showAddAddressCta ? (
						<CtaCard
							title="Add an address"
							description="You have no addresses yet. Add your first one."
							actionLabel="Add address"
							to="/profile/addresses"
							icon={MapPin}
						/>
					) : null}
				</div>
			) : null}
		</div>
	);
}
