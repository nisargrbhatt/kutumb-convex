import { Fragment, useMemo, useState } from "react";
import {
	flexRender,
	getCoreRowModel,
	getExpandedRowModel,
	useReactTable,
	type ColumnDef,
	type ExpandedState,
} from "@tanstack/react-table";
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

type GroupRow = AuditGroup & { summary: string; how: AuditHow; latestAt: Date };

const metaClass = (def: ColumnDef<GroupRow>) =>
	(def.meta as { className?: string } | undefined)?.className;

const COLUMNS: ColumnDef<GroupRow>[] = [
	{
		id: "expand",
		header: () => <span className="sr-only">Expand</span>,
		meta: { className: "w-10" },
		cell: ({ row }) => {
			const isOpen = row.getIsExpanded();
			return (
				<Button
					variant="ghost"
					size="icon-sm"
					aria-expanded={isOpen}
					aria-label={isOpen ? "Collapse change" : "Expand change"}
					onClick={(e) => {
						e.stopPropagation();
						row.toggleExpanded();
					}}
				>
					{isOpen ? <ChevronDown /> : <ChevronRight />}
				</Button>
			);
		},
	},
	{
		id: "change",
		header: "Change",
		meta: { className: "whitespace-normal" },
		cell: ({ row }) => row.original.summary,
	},
	{
		id: "how",
		header: "How",
		meta: { className: "w-32" },
		cell: ({ row }) => <HowBadge how={row.original.how} />,
	},
	{
		id: "when",
		header: "When",
		meta: { className: "w-40 text-muted-foreground" },
		cell: ({ row }) => <When at={row.original.latestAt} />,
	},
];

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
	const [expanded, setExpanded] = useState<ExpandedState>({});
	const data = useMemo<GroupRow[]>(
		() =>
			groups.map((g) => ({
				...g,
				summary: groupSummary(g.events),
				how: groupHow(g.events),
				latestAt: g.events[0]?.createdAt ?? new Date(0),
			})),
		[groups]
	);
	const table = useReactTable({
		data,
		columns: COLUMNS,
		state: { expanded },
		onExpandedChange: setExpanded,
		getRowId: (g) => g.key,
		getRowCanExpand: () => true,
		getCoreRowModel: getCoreRowModel(),
		getExpandedRowModel: getExpandedRowModel(),
	});
	const rows = table.getRowModel().rows;

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

	const columnCount = table.getVisibleLeafColumns().length;

	return (
		<div className="flex w-full flex-col gap-3">
			{/* md+: TanStack Table, group rows expand into their events */}
			<div className="hidden rounded-md border md:block">
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((hg) => (
							<TableRow key={hg.id}>
								{hg.headers.map((header) => (
									<TableHead key={header.id} className={metaClass(header.column.columnDef)}>
										{header.isPlaceholder
											? null
											: flexRender(header.column.columnDef.header, header.getContext())}
									</TableHead>
								))}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{rows.map((row) => (
							<Fragment key={row.id}>
								<TableRow className="cursor-pointer" onClick={row.getToggleExpandedHandler()}>
									{row.getVisibleCells().map((cell) => (
										<TableCell key={cell.id} className={metaClass(cell.column.columnDef)}>
											{flexRender(cell.column.columnDef.cell, cell.getContext())}
										</TableCell>
									))}
								</TableRow>
								{row.getIsExpanded()
									? row.original.events.map((e) => (
											<TableRow key={e.id} className="bg-muted/30 hover:bg-muted/30">
												<TableCell />
												<TableCell colSpan={columnCount - 1} className="whitespace-normal">
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

			{/* < md: stacked cards over the same row model / expansion state */}
			<ul className="flex flex-col gap-2 md:hidden">
				{rows.map((row) => {
					const g = row.original;
					const isOpen = row.getIsExpanded();
					return (
						<li key={row.id} className="rounded-lg border">
							<button
								type="button"
								className="flex w-full items-start gap-2 p-3 text-left"
								aria-expanded={isOpen}
								onClick={row.getToggleExpandedHandler()}
							>
								{isOpen ? (
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
							{isOpen ? (
								<ul className="flex flex-col divide-y border-t bg-muted/30 px-3">
									{g.events.map((e) => (
										<li key={e.id} className="py-2">
											<EventDetail event={e} />
										</li>
									))}
								</ul>
							) : null}
						</li>
					);
				})}
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
