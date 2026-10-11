import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import z from "zod";
import { KindBadge, RequestDiff, StaleBadge } from "@/components/changeRequest/RequestDiff";
import { RejectRequestDialog } from "@/components/changeRequest/RejectRequestDialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { staleReasonText } from "@/domain/changeRequest";
import type { ReviewQueueGroup } from "@/domain/queries/changeRequests";
import { requestKindLabel } from "@/domain/requestDiff";
import { useReviewChangeRequest } from "@/queries/changeRequest";

export type ReviewGroup = ReviewQueueGroup;
type Request = ReviewGroup["requests"][number];

const noteSchema = z.object({
	note: z.string().trim().max(500, "Keep it under 500 characters"),
});

/** One pending request: diff, stale reason, overlap warning, approve (optional note) / reject. */
function RequestCard({
	request,
	index,
	siblings,
	onReject,
}: {
	request: Request;
	index: number;
	siblings: Request[];
	onReject: (r: Request) => void;
}) {
	const approve = useReviewChangeRequest();
	const form = useForm<z.infer<typeof noteSchema>>({
		resolver: zodResolver(noteSchema),
		defaultValues: { note: "" },
	});
	const overlaps = siblings
		.map((s, i) => ({ s, n: i + 1 }))
		.filter(({ s }) => request.overlapsWith.includes(s.id));
	const headingId = `request-${request.id}`;

	return (
		<section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-lg border p-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h3 id={headingId} className="flex flex-wrap items-center gap-1">
					<span className="sr-only">
						Request {index + 1}: {requestKindLabel(request.kind)}
					</span>
					<span aria-hidden className="text-xs text-muted-foreground tabular-nums">
						#{index + 1}
					</span>
					<KindBadge kind={request.kind} />
					{request.stale ? <StaleBadge /> : null}
				</h3>
				<span className="text-xs text-muted-foreground">
					{request.submitterName} ·{" "}
					<time dateTime={new Date(request.createdAt).toISOString()}>
						{formatDistanceToNow(request.createdAt, { addSuffix: true })}
					</time>
				</span>
			</div>

			{request.stale ? (
				<Alert variant="destructive">
					<AlertTriangle />
					<AlertTitle>Stale: can't approve</AlertTitle>
					<AlertDescription>
						{staleReasonText(request.stale)}. Reject it, or ask the submitter to withdraw and
						resubmit.
					</AlertDescription>
				</Alert>
			) : null}

			{overlaps.length > 0 ? (
				<p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
					Overlaps with {overlaps.map(({ n }) => `#${n}`).join(", ")}: approving one may make the
					other stale.
				</p>
			) : null}

			<RequestDiff request={request} />

			<Form {...form}>
				<form
					className="flex flex-col gap-3"
					onSubmit={form.handleSubmit(({ note }) =>
						approve.mutate({
							changeRequestId: request.id,
							kind: request.kind,
							review: { decision: "approve", note: note || null },
						})
					)}
				>
					{request.stale ? null : (
						<FormField
							control={form.control}
							name="note"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="text-xs text-muted-foreground">
										Approval note (optional)
									</FormLabel>
									<FormControl>
										<Textarea rows={2} placeholder="Shown to the submitter" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					)}
					<div className="flex flex-wrap justify-end gap-2">
						<Button
							type="button"
							size="sm"
							variant="outline"
							disabled={approve.isPending}
							onClick={() => onReject(request)}
						>
							Reject…
						</Button>
						<Button type="submit" size="sm" disabled={!!request.stale || approve.isPending}>
							{approve.isPending ? <Spinner /> : null}
							Approve
						</Button>
					</div>
				</form>
			</Form>
		</section>
	);
}

/** Right drawer: a profile's pending requests stacked, oldest first. */
export function ReviewDrawer({
	group,
	onClose,
}: {
	group: ReviewGroup | null;
	onClose: () => void;
}) {
	const [rejecting, setRejecting] = useState<Request | null>(null);
	// Keep the last group on screen while the drawer animates closed (e.g. last request resolved).
	const last = useRef<ReviewGroup | null>(null);
	if (group) last.current = group;
	const shown = group ?? last.current;
	const reject = useReviewChangeRequest(() => setRejecting(null));

	return (
		<>
			<Sheet open={!!group} onOpenChange={(o) => !o && onClose()}>
				<SheetContent
					side="right"
					className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
				>
					<SheetHeader className="border-b pr-12">
						<SheetTitle>{shown?.profileName ?? "Review"}</SheetTitle>
						<SheetDescription>
							{shown
								? `${shown.count} pending request${shown.count === 1 ? "" : "s"} · approve each independently`
								: null}
						</SheetDescription>
						{shown && shown.profileStatus !== null ? (
							<Link
								to="/members/$id"
								params={{ id: shown.profileId }}
								className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
							>
								Open profile <ExternalLink className="size-3.5" aria-hidden />
							</Link>
						) : null}
					</SheetHeader>
					<ScrollArea className="min-h-0 flex-1">
						<div className="flex flex-col gap-4 p-4 sm:p-6">
							{shown?.requests.map((r, i) => (
								<RequestCard
									key={r.id}
									request={r}
									index={i}
									siblings={shown.requests}
									onReject={setRejecting}
								/>
							))}
						</div>
					</ScrollArea>
				</SheetContent>
			</Sheet>

			<RejectRequestDialog
				key={rejecting?.id ?? "none"}
				open={!!rejecting}
				onOpenChange={(o) => !o && setRejecting(null)}
				isPending={reject.isPending}
				description={
					rejecting
						? `${requestKindLabel(rejecting.kind)} by ${rejecting.submitterName}. ${
								rejecting.kind === "create"
									? "The draft will be deleted and the member slot freed."
									: "The submitter will see your reason."
							}`
						: undefined
				}
				onReject={(reason) =>
					rejecting &&
					reject.mutate({
						changeRequestId: rejecting.id,
						kind: rejecting.kind,
						review: { decision: "reject", note: reason },
					})
				}
			/>
		</>
	);
}
