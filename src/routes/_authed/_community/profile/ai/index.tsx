import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Bot } from "lucide-react";
import { ConnectAiClientButton } from "@/components/ai/ConnectAiClientButton";
import { ConnectionsTable } from "@/components/ai/ConnectionsTable";
import { PageHeader } from "@/components/CommunityLayout/PageHeader";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { myConnectionsQuery, useRevokeConnection } from "@/queries/connections";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_authed/_community/profile/ai/")({
	loader: ({ context }) => context.queryClient.ensureQueryData(myConnectionsQuery(context.userId)),
	component: RouteComponent,
});

const ALL = "all";

function ConnectionsSection({ userId, orgId }: { userId: string; orgId: string }) {
	const { data: connections } = useSuspenseQuery(myConnectionsQuery(userId));
	const { data: activeOrg } = authClient.useActiveOrganization();
	const revoke = useRevokeConnection(userId);
	// Defaults to the active org; "all" shows every community.
	const [filter, setFilter] = useState<string>(orgId);

	if (connections.length === 0) {
		return (
			<Empty className="border">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Bot />
					</EmptyMedia>
					<EmptyTitle>No AI clients connected</EmptyTitle>
					<EmptyDescription>
						Connect an AI client like Claude or ChatGPT to read your community data.
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<ConnectAiClientButton />
				</EmptyContent>
			</Empty>
		);
	}

	const orgs = new Map(connections.map((c) => [c.orgId, c.orgName]));
	if (!orgs.has(orgId) && activeOrg) orgs.set(orgId, activeOrg.name);
	const options = [
		{ value: ALL, label: "All communities" },
		...[...orgs].map(([value, label]) => ({ value, label })),
	].sort((a, b) => (a.value === ALL ? -1 : b.value === ALL ? 1 : a.label.localeCompare(b.label)));

	const rows = filter === ALL ? connections : connections.filter((c) => c.orgId === filter);
	const selected = options.find((o) => o.value === filter);

	return (
		<div className="flex w-full flex-col gap-4">
			<Select
				items={Object.fromEntries(options.map((o) => [o.value, o.label]))}
				value={filter}
				onValueChange={(v) => v && setFilter(v)}
			>
				<SelectTrigger className="w-full sm:w-64" aria-label="Community filter">
					<SelectValue placeholder="Community">{selected?.label}</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{options.map((o) => (
						<SelectItem key={o.value} value={o.value}>
							{o.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<ConnectionsTable
				rows={rows}
				emptyText="No connections in this community."
				onRevoke={revoke.mutateAsync}
				isRevoking={revoke.isPending}
			/>
		</div>
	);
}

function RouteComponent() {
	const { organizationId, userId } = Route.useRouteContext();

	return (
		<div className="flex h-full w-full flex-col items-start justify-start gap-4 overflow-y-auto p-2">
			<PageHeader
				crumbs={[{ label: "Profile", to: "/profile/info" }, { label: "AI" }]}
				title="AI"
				description="AI clients connected to your communities. Each acts as you, with your role, in one community."
				actions={<ConnectAiClientButton variant="outline" />}
			/>
			<div className="flex w-full flex-col gap-6 pb-12">
				<ConnectionsSection key={organizationId} userId={userId} orgId={organizationId} />
			</div>
		</div>
	);
}
