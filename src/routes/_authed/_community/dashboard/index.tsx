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
import z from "zod";
import { TrialStartedDialog } from "@/components/billing/TrialStartedDialog";
import { ORGANIZATION_ROLES } from "@/db/constants";
import { trialSummaryQuery } from "@/queries/billing";
import { ArrowDownLeft, ArrowUpRight, MapPin, UserPlus, Users } from "lucide-react";

export const Route = createFileRoute("/_authed/_community/dashboard/")({
	// `trialStarted=1`: just created the org → one-time Trial started dialog (owners).
	validateSearch: z.object({ trialStarted: z.literal(1).optional().catch(undefined) }),
	loader: async ({ context }) => {
		const { queryClient: qc, organizationId: orgId } = context;
		const isOwner = context.member?.role === ORGANIZATION_ROLES.owner;
		await Promise.allSettled([
			// Owner load also retries a missing Dodo sub (`ensureSubscription`).
			isOwner ? qc.ensureQueryData(trialSummaryQuery(orgId)) : null,
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

	const { organizationId: orgId, member } = Route.useRouteContext();
	const { trialStarted } = Route.useSearch();
	const navigate = Route.useNavigate();
	const showTrialStarted = trialStarted === 1 && member?.role === ORGANIZATION_ROLES.owner;
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
			<TrialStartedDialog
				orgId={orgId}
				orgName={activeOrg?.name ?? "Your organization"}
				open={showTrialStarted}
				onClose={() => navigate({ search: {}, replace: true })}
			/>
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
