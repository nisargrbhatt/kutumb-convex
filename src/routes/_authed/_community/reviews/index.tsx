import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, stripSearchParams } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { ChevronRight, Inbox } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/CommunityLayout/PageHeader";
import { KindBadge, StaleBadge } from "@/components/changeRequest/RequestDiff";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { can } from "@/domain/permission";
import { reviewQueueQuery } from "@/queries/changeRequest";
import type { ReviewGroup } from "./-components/ReviewDrawer";
import { ReviewDrawer } from "./-components/ReviewDrawer";

/** `profile`: open that profile's drawer (deep link from the member detail banner). */
const searchSchema = z.object({ profile: z.string().default("").catch("") });

export const Route = createFileRoute("/_authed/_community/reviews/")({
	validateSearch: searchSchema,
	search: { middlewares: [stripSearchParams({ profile: "" })] },
	beforeLoad: ({ context }) => {
		const role = context.member?.role;
		if (
			!role ||
			!can(
				{ userId: context.userId, organizationId: context.organizationId, role },
				{ changeRequest: ["review"] }
			)
		) {
			throw redirect({ to: "/dashboard" });
		}
	},
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(reviewQueueQuery(context.organizationId)),
	component: RouteComponent,
});

const columns = (open: (profileId: string) => void): ColumnDef<ReviewGroup>[] => [
	{
		accessorKey: "profileName",
		header: "Profile",
		cell: ({ row }) => (
			<div className="flex min-w-0 flex-col">
				<span className="font-medium break-words">{row.original.profileName}</span>
				{row.original.profileStatus === "draft" ? (
					<span className="text-xs text-muted-foreground">Draft</span>
				) : null}
				{/* Kinds + age collapse into the profile cell below md / sm. */}
				<span className="mt-1 flex flex-wrap gap-1 md:hidden">
					{row.original.kinds.map((k) => (
						<KindBadge key={k} kind={k} />
					))}
				</span>
				<span className="mt-1 text-xs text-muted-foreground sm:hidden">
					Oldest {formatDistanceToNow(row.original.oldestAt, { addSuffix: true })}
				</span>
			</div>
		),
	},
	{
		accessorKey: "count",
		header: "Pending",
		cell: ({ row }) => (
			<div className="flex flex-wrap items-center gap-1">
				<Badge variant="outline" className="tabular-nums">
					{row.original.count}
				</Badge>
				{row.original.staleCount > 0 ? <StaleBadge /> : null}
			</div>
		),
	},
	{
		id: "kinds",
		header: "Kinds",
		meta: { className: "hidden md:table-cell" },
		cell: ({ row }) => (
			<div className="flex flex-wrap gap-1">
				{row.original.kinds.map((k) => (
					<KindBadge key={k} kind={k} />
				))}
			</div>
		),
	},
	{
		accessorKey: "oldestAt",
		header: "Oldest",
		meta: { className: "hidden sm:table-cell" },
		cell: ({ row }) => (
			<time
				dateTime={new Date(row.original.oldestAt).toISOString()}
				className="whitespace-nowrap text-muted-foreground"
			>
				{formatDistanceToNow(row.original.oldestAt, { addSuffix: true })}
			</time>
		),
	},
	{
		id: "actions",
		header: () => <span className="sr-only">Actions</span>,
		meta: { className: "w-px text-right" },
		cell: ({ row }) => (
			<Button
				size="sm"
				variant="outline"
				onClick={() => open(row.original.profileId)}
				aria-label={`Review ${row.original.count} pending for ${row.original.profileName}`}
			>
				<span className="hidden sm:inline">Review</span>
				<ChevronRight />
			</Button>
		),
	},
];

function RouteComponent() {
	const { organizationId: orgId } = Route.useRouteContext();
	const { data: groups } = useSuspenseQuery(reviewQueueQuery(orgId));
	const { profile: selected } = Route.useSearch();
	const navigate = Route.useNavigate();
	const setSelected = (profile: string | null) =>
		navigate({ search: { profile: profile ?? "" }, replace: true });
	const group = groups.find((g) => g.profileId === selected) ?? null;
	const total = groups.reduce((n, g) => n + g.count, 0);

	return (
		<div className="flex h-full w-full flex-col items-start justify-start gap-4 overflow-y-auto p-2">
			<PageHeader
				crumbs={[{ label: "Reviews" }]}
				title="Reviews"
				description="Pending Change Requests from members, oldest first. Approve or reject each one."
			/>

			{groups.length === 0 ? (
				<Empty className="w-full border border-dashed">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Inbox />
						</EmptyMedia>
						<EmptyTitle>No pending requests</EmptyTitle>
						<EmptyDescription>Member suggestions and new profiles show up here.</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<div className="flex w-full flex-col gap-3">
					<p className="text-sm text-muted-foreground" aria-live="polite">
						{total} pending across {groups.length} profile{groups.length === 1 ? "" : "s"}
					</p>
					<DataTable columns={columns(setSelected)} data={groups} />
				</div>
			)}

			<ReviewDrawer group={group} onClose={() => setSelected(null)} />
		</div>
	);
}
