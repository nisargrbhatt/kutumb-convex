import { getActiveMemberCountQuery, getMyCommunityProfileQuery } from "@/api/communityProfile";
import { getMyCommunityAddressesQuery } from "@/api/communityAddress";
import {
	getMyIncomingRelationCountQuery,
	getMyOutgoingRelationCountQuery,
} from "@/api/communityRelation";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { CtaCard } from "@/components/dashboard/CtaCard";
import { StatCard } from "@/components/dashboard/StatCard";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownLeft, ArrowUpRight, MapPin, UserPlus, Users } from "lucide-react";

export const Route = createFileRoute("/_authed/_community/dashboard/")({
	loader: async ({ context }) => {
		await Promise.allSettled([
			context.queryClient.ensureQueryData(getActiveMemberCountQuery()),
			context.queryClient.ensureQueryData(getMyIncomingRelationCountQuery()),
			context.queryClient.ensureQueryData(getMyOutgoingRelationCountQuery()),
			context.queryClient.ensureQueryData(getMyCommunityProfileQuery()),
			context.queryClient.ensureQueryData(getMyCommunityAddressesQuery()),
		]);
	},
	component: RouteComponent,
});

function PageHeader() {
	return (
		<div className="flex flex-row items-center justify-start gap-2">
			<SidebarTrigger />
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbPage>Home</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
		</div>
	);
}

function RouteComponent() {
	const { data: activeOrg } = authClient.useActiveOrganization();

	const { data: memberCount } = useSuspenseQuery(getActiveMemberCountQuery());
	const { data: incomingCount } = useSuspenseQuery(getMyIncomingRelationCountQuery());
	const { data: outgoingCount } = useSuspenseQuery(getMyOutgoingRelationCountQuery());
	const { data: profile } = useSuspenseQuery(getMyCommunityProfileQuery());
	const { data: addresses } = useSuspenseQuery(getMyCommunityAddressesQuery());

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
