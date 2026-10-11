import { useEffect, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow, format } from "date-fns";
import { AlertTriangle, ExternalLink, Inbox } from "lucide-react";
import { PageHeader } from "@/components/CommunityLayout/PageHeader";
import {
	RequestDiff,
	RequestKindBadge,
	RequestStatusBadge,
} from "@/components/changeRequest/RequestDiff";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable } from "@/components/ui/data-table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { staleReasonText } from "@/domain/changeRequest";
import { CHANGE_REQUEST_KIND_LABEL, requestOutcome } from "@/domain/memberRequests";
import type { MyRequest } from "@/domain/queries/changeRequests";
import { cn } from "@/lib/utils";
import {
	myRequestsQuery,
	useMarkRequestsSeen,
	useWithdrawChangeRequest,
} from "@/queries/changeRequest";

export const Route = createFileRoute("/_authed/_community/my-requests/")({
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(myRequestsQuery(context.organizationId));
	},
	component: RouteComponent,
});

const isUnseen = (r: MyRequest) =>
	r.submitterSeenAt == null && (r.status === "approved" || r.status === "rejected");

/** Profile still exists (a rejected / withdrawn create deleted its draft). */
const profileExists = (r: MyRequest) =>
	!(r.kind === "create" && (r.status === "rejected" || r.status === "withdrawn"));

function When({ at }: { at: Date }) {
	return (
		<time dateTime={at.toISOString()} title={format(at, "PPpp")}>
			{formatDistanceToNow(at, { addSuffix: true })}
		</time>
	);
}

function OutcomeText({ r }: { r: MyRequest }) {
	const o = requestOutcome(r);
	return (
		<span
			className={cn(
				"block truncate",
				o.tone === "muted" && "text-muted-foreground",
				o.tone === "destructive" && "text-destructive"
			)}
			title={o.note ? `${o.summary}: ${o.note}` : o.summary}
		>
			{o.summary}
			{o.note ? <span className="text-muted-foreground">: “{o.note}”</span> : null}
		</span>
	);
}

function RouteComponent() {
	const { organizationId: orgId } = Route.useRouteContext();
	const { data: requests } = useSuspenseQuery(myRequestsQuery(orgId));
	const [openId, setOpenId] = useState<string | null>(null);
	const markSeen = useMarkRequestsSeen(orgId);
	const { mutate: markSeenMutate } = markSeen;

	// Visiting marks resolved requests seen (clears the nav badge). Rows keep their "New" dot until
	// the list refetches.
	useEffect(() => {
		markSeenMutate();
	}, [markSeenMutate]);

	const columns: ColumnDef<MyRequest>[] = [
		{
			id: "kind",
			header: "Request",
			cell: ({ row }) => (
				<div className="flex items-center gap-2">
					{isUnseen(row.original) ? (
						<span className="size-2 shrink-0 rounded-full bg-primary" aria-label="New outcome" />
					) : null}
					<RequestKindBadge kind={row.original.kind} />
				</div>
			),
		},
		{
			id: "profile",
			header: "Profile",
			cell: ({ row }) => (
				<Button
					variant="link"
					className="h-auto max-w-48 justify-start truncate p-0 font-medium sm:max-w-64"
					onClick={() => setOpenId(row.original.id)}
				>
					<span className="truncate">{row.original.profileName}</span>
				</Button>
			),
		},
		{
			id: "status",
			header: "Status",
			cell: ({ row }) => <RequestStatusBadge status={row.original.status} />,
		},
		{
			id: "outcome",
			header: "Outcome",
			meta: { className: "hidden max-w-xs md:table-cell" },
			cell: ({ row }) => <OutcomeText r={row.original} />,
		},
		{
			id: "submitted",
			header: "Submitted",
			meta: { className: "hidden whitespace-nowrap text-muted-foreground sm:table-cell" },
			cell: ({ row }) => <When at={row.original.createdAt} />,
		},
	];

	const open = requests.find((r) => r.id === openId) ?? null;

	return (
		<div className="flex h-full w-full flex-col items-start justify-start gap-4 overflow-y-auto p-2">
			<PageHeader
				crumbs={[{ label: "My requests" }]}
				title="My requests"
				description="Changes you suggested to Userless Profiles and drafts you added, with their outcome."
			/>
			<div className="w-full pb-12">
				{requests.length === 0 ? (
					<div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
						<div className="mb-4 rounded-full bg-muted/50 p-4">
							<Inbox className="size-8 text-muted-foreground/50" />
						</div>
						<h2 className="text-lg font-medium">No requests yet</h2>
						<p className="mt-1 max-w-sm text-sm text-muted-foreground">
							Suggest an edit on a member's profile and it shows up here.
						</p>
					</div>
				) : (
					<DataTable columns={columns} data={requests} />
				)}
			</div>
			<RequestDrawer request={open} onClose={() => setOpenId(null)} />
		</div>
	);
}

function RequestDrawer({ request, onClose }: { request: MyRequest | null; onClose: () => void }) {
	const [confirmOpen, setConfirmOpen] = useState(false);
	const withdraw = useWithdrawChangeRequest(() => setConfirmOpen(false));
	const outcome = request ? requestOutcome(request) : null;

	return (
		<Sheet open={request !== null} onOpenChange={(o) => !o && onClose()}>
			<SheetContent
				side="right"
				className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
			>
				{request && outcome ? (
					<>
						<SheetHeader className="border-b pr-12">
							<SheetTitle>
								{CHANGE_REQUEST_KIND_LABEL[request.kind]} · {request.profileName}
							</SheetTitle>
							<SheetDescription>
								Submitted <When at={request.createdAt} />
							</SheetDescription>
						</SheetHeader>
						<ScrollArea className="min-h-0 flex-1">
							<div className="flex flex-col gap-4 p-4 sm:p-6">
								<div className="flex flex-wrap items-center gap-2">
									<RequestStatusBadge status={request.status} />
									{request.resolvedAt ? (
										<span className="text-xs text-muted-foreground">
											<When at={request.resolvedAt} />
										</span>
									) : null}
									{profileExists(request) ? (
										<Button
											variant="link"
											size="sm"
											className="ml-auto h-auto p-0"
											render={<Link to="/members/$id" params={{ id: request.profileId }} />}
											nativeButton={false}
										>
											View profile
											<ExternalLink />
										</Button>
									) : null}
								</div>
								{request.status === "approved" || request.status === "rejected" ? (
									<Alert variant={request.status === "rejected" ? "destructive" : "default"}>
										<AlertTitle>{outcome.summary}</AlertTitle>
										<AlertDescription>
											{outcome.note ??
												(request.status === "approved" ? "No note." : "No reason given.")}
										</AlertDescription>
									</Alert>
								) : request.status === "pending" ? null : (
									<p className="text-sm text-muted-foreground">{outcome.summary}.</p>
								)}
								{request.status === "pending" && request.stale ? (
									<Alert variant="destructive">
										<AlertTriangle />
										<AlertTitle>Can't be approved as is</AlertTitle>
										<AlertDescription>
											{staleReasonText(request.stale)}. Withdraw it and suggest again.
										</AlertDescription>
									</Alert>
								) : null}
								<section className="flex flex-col gap-2">
									<h3 className="text-sm font-medium">What you suggested</h3>
									<RequestDiff kind={request.kind} payload={request.payload} />
								</section>
							</div>
						</ScrollArea>
						{request.status === "pending" ? (
							<SheetFooter className="mt-0 flex-row flex-wrap justify-end border-t bg-popover">
								<ConfirmDialog
									open={confirmOpen}
									onOpenChange={setConfirmOpen}
									trigger={<Button variant="outline">Withdraw</Button>}
									title="Withdraw request?"
									description={
										request.kind === "create"
											? "The draft profile will be deleted. This cannot be undone."
											: "Owner/admins will no longer see it. You can suggest it again later."
									}
									confirmLabel="Withdraw"
									destructive
									onConfirm={() => withdraw.mutate(request.id)}
									isPending={withdraw.isPending}
								/>
							</SheetFooter>
						) : null}
					</>
				) : null}
			</SheetContent>
		</Sheet>
	);
}
