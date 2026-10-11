import { Fragment, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { AuditHow } from "@/domain/audit";
import {
	auditActionLabel,
	diffRows,
	formatAuditValue,
	groupHow,
	groupSummary,
} from "@/domain/audit";
import { cn } from "@/lib/utils";
import type { AuditGroup } from "@/queries/audit";

type AuditEvent = AuditGroup["events"][number];

const HOW_VARIANT: Record<AuditHow, "default" | "secondary" | "destructive" | "outline"> = {
	pending: "outline",
	approved: "default",
	rejected: "destructive",
	withdrawn: "secondary",
	superseded: "secondary",
	direct: "secondary",
	"self-edit": "outline",
};

function HowBadge({ how }: { how: AuditHow }) {
	return (
		<Badge variant={HOW_VARIANT[how]} className="capitalize">
			{how}
		</Badge>
	);
}

/** Inline before → after / value list of one event's payload. */
function EventDiff({ payload }: { payload: unknown }) {
	const rows = diffRows(payload);
	if (rows.length === 0) return null;
	return (
		<dl className="grid grid-cols-1 gap-x-3 gap-y-1 text-xs sm:grid-cols-[minmax(6rem,auto)_1fr]">
			{rows.map((r, i) => (
				<Fragment key={`${r.label}-${i}`}>
					<dt className="font-medium text-muted-foreground">{r.label}</dt>
					<dd className="min-w-0 break-words">
						{"value" in r ? (
							formatAuditValue(r.value)
						) : (
							<>
								<span className="text-muted-foreground line-through">
									{formatAuditValue(r.before)}
								</span>
								<span aria-hidden> → </span>
								<span className="sr-only"> changed to </span>
								<span>{formatAuditValue(r.after)}</span>
							</>
						)}
					</dd>
				</Fragment>
			))}
		</dl>
	);
}

function EventDetail({ event }: { event: AuditEvent }) {
	return (
		<div className="flex flex-col gap-1.5 py-1 text-sm">
			<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
				<span className="font-medium">{auditActionLabel(event.action)}</span>
				<span className="text-muted-foreground">·</span>
				<span>
					{event.actorName}{" "}
					<span className="text-xs text-muted-foreground capitalize">({event.actorRole})</span>
				</span>
				<span className="text-muted-foreground">·</span>
				<time className="text-xs text-muted-foreground" dateTime={event.createdAt.toISOString()}>
					{format(event.createdAt, "d MMM yyyy, HH:mm")}
				</time>
			</div>
			<EventDiff payload={event.payload} />
		</div>
	);
}

function When({ at }: { at: Date }) {
	return (
		<time dateTime={at.toISOString()} title={format(at, "PPpp")}>
			{formatDistanceToNow(at, { addSuffix: true })}
		</time>
	);
}

/**
 * History grouped by Change Request: one row per logical change (summary, How badge, when),
 * expandable to its events (action, Actor + role, time, inline diff). Table on md+, stacked
 * cards below. Shared by the member detail History tab and `/audit-log`.
 */
export function AuditHistory({
	groups,
	isLoading,
	hasNextPage,
	isFetchingNextPage,
	onLoadMore,
	emptyText = "No history yet.",
}: {
	groups: AuditGroup[];
	isLoading: boolean;
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	onLoadMore: () => void;
	emptyText?: string;
}) {
	const [open, setOpen] = useState<Set<string>>(() => new Set());
	const toggle = (key: string) =>
		setOpen((s) => {
			const next = new Set(s);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});

	if (isLoading) {
		return (
			<div className="flex flex-col gap-2" aria-busy="true">
				{Array.from({ length: 4 }, (_, i) => (
					<Skeleton key={i} className="h-12 w-full" />
				))}
			</div>
		);
	}

	if (groups.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-center">
				<History className="size-8 text-muted-foreground/50" />
				<p className="text-sm text-muted-foreground">{emptyText}</p>
			</div>
		);
	}

	const rows = groups.map((g) => ({
		...g,
		summary: groupSummary(g.events),
		how: groupHow(g.events),
		latestAt: g.events[0]?.createdAt ?? new Date(0),
		isOpen: open.has(g.key),
	}));

	return (
		<div className="flex w-full flex-col gap-3">
			{/* md+: table */}
			<div className="hidden rounded-md border md:block">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-10">
								<span className="sr-only">Expand</span>
							</TableHead>
							<TableHead>Change</TableHead>
							<TableHead className="w-32">How</TableHead>
							<TableHead className="w-40">When</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((g) => (
							<Fragment key={g.key}>
								<TableRow className="cursor-pointer" onClick={() => toggle(g.key)}>
									<TableCell>
										<Button
											variant="ghost"
											size="icon-sm"
											aria-expanded={g.isOpen}
											aria-label={g.isOpen ? "Collapse change" : "Expand change"}
											onClick={(e) => {
												e.stopPropagation();
												toggle(g.key);
											}}
										>
											{g.isOpen ? <ChevronDown /> : <ChevronRight />}
										</Button>
									</TableCell>
									<TableCell className="whitespace-normal">{g.summary}</TableCell>
									<TableCell>
										<HowBadge how={g.how} />
									</TableCell>
									<TableCell className="text-muted-foreground">
										<When at={g.latestAt} />
									</TableCell>
								</TableRow>
								{g.isOpen
									? g.events.map((e) => (
											<TableRow key={e.id} className="bg-muted/30 hover:bg-muted/30">
												<TableCell />
												<TableCell colSpan={3} className="whitespace-normal">
													<EventDetail event={e} />
												</TableCell>
											</TableRow>
										))
									: null}
							</Fragment>
						))}
					</TableBody>
				</Table>
			</div>

			{/* < md: stacked */}
			<ul className="flex flex-col gap-2 md:hidden">
				{rows.map((g) => (
					<li key={g.key} className="rounded-lg border">
						<button
							type="button"
							className="flex w-full items-start gap-2 p-3 text-left"
							aria-expanded={g.isOpen}
							onClick={() => toggle(g.key)}
						>
							{g.isOpen ? (
								<ChevronDown className="mt-0.5 size-4 shrink-0" />
							) : (
								<ChevronRight className="mt-0.5 size-4 shrink-0" />
							)}
							<span className="flex min-w-0 flex-1 flex-col gap-1.5">
								<span className="text-sm break-words">{g.summary}</span>
								<span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
									<HowBadge how={g.how} />
									<When at={g.latestAt} />
								</span>
							</span>
						</button>
						{g.isOpen ? (
							<ul className={cn("flex flex-col divide-y border-t bg-muted/30 px-3")}>
								{g.events.map((e) => (
									<li key={e.id} className="py-2">
										<EventDetail event={e} />
									</li>
								))}
							</ul>
						) : null}
					</li>
				))}
			</ul>

			{hasNextPage ? (
				<Button
					variant="outline"
					className="self-center"
					onClick={onLoadMore}
					disabled={isFetchingNextPage}
				>
					{isFetchingNextPage ? <Spinner /> : null}
					Load more
				</Button>
			) : null}
		</div>
	);
}
