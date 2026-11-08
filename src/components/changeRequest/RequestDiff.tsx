import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ChangeRequestKind, TypedPayload } from "@/domain/changeRequest";
import { formatAuditValue } from "@/domain/audit";
import { blobUrl } from "@/domain/blob";
import { useActor } from "@/hooks/useActor";
import { requestDiff, requestKindLabel } from "@/domain/requestDiff";
import { cn } from "@/lib/utils";

export function KindBadge({ kind }: { kind: ChangeRequestKind }) {
	return (
		<Badge variant={kind === "create" ? "default" : "secondary"} className="whitespace-nowrap">
			{requestKindLabel(kind)}
		</Badge>
	);
}

export function StaleBadge() {
	return (
		<Badge variant="destructive" className="gap-1">
			<AlertTriangle aria-hidden /> Stale
		</Badge>
	);
}

const TONE_HEADING = { add: "Adds", remove: "Removes" } as const;

/** One square photo (`display`), or a "No photo" placeholder. */
function PhotoTile({ label, blobId }: { label: string; blobId: string | null }) {
	const organizationId = useActor()?.organizationId;
	return (
		<figure className="flex min-w-0 flex-col gap-1.5">
			<figcaption className="text-xs font-medium text-muted-foreground">{label}</figcaption>
			<div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border bg-muted">
				{blobId && organizationId ? (
					<img
						src={blobUrl(organizationId, blobId, "display")}
						alt={label}
						className="size-full object-cover"
						loading="lazy"
					/>
				) : (
					<span className="text-sm text-muted-foreground">No photo</span>
				)}
			</div>
		</figure>
	);
}

/**
 * Before → after of one Change Request (shared by Reviews + My requests). `info` / `address_edit`
 * → Field / Current / Proposed table; add / remove → snapshot list; `create` → `emptyText`.
 */
export function RequestDiff({
	request,
	emptyText = "New profile: review the draft itself.",
	currentPhotoBlobId,
}: {
	request: TypedPayload;
	emptyText?: string;
	/**
	 * `photo` and pending only: the photo to compare against, shown beside the proposed one.
	 * Absent (closed request) → text, never a thumbnail.
	 */
	currentPhotoBlobId?: string | null;
}) {
	if (request.kind === "photo" && currentPhotoBlobId !== undefined)
		return (
			<div className="grid grid-cols-2 gap-3 sm:gap-4">
				<PhotoTile label="Current" blobId={currentPhotoBlobId} />
				<PhotoTile
					label={request.payload.proposed ? "Proposed" : "Proposed: remove photo"}
					blobId={request.payload.proposed}
				/>
			</div>
		);
	const { tone, rows } = requestDiff(request);
	if (tone === "none" || rows.length === 0)
		return <p className="text-sm text-muted-foreground">{emptyText}</p>;

	if (tone === "change")
		return (
			<div className="overflow-x-auto rounded-md border">
				<table className="w-full text-sm">
					<thead className="bg-muted/50 text-left text-xs text-muted-foreground">
						<tr>
							<th scope="col" className="p-2 font-medium">
								Field
							</th>
							<th scope="col" className="p-2 font-medium">
								Before
							</th>
							<th scope="col" className="p-2 font-medium">
								Proposed
							</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((r, i) => (
							<tr key={`${r.label}-${i}`} className="border-t align-top">
								<th scope="row" className="p-2 text-left font-medium">
									{r.label}
								</th>
								<td className="p-2 break-words text-muted-foreground line-through decoration-destructive/60">
									{formatAuditValue("before" in r ? r.before : null)}
								</td>
								<td className="bg-emerald-500/10 p-2 break-words">
									{formatAuditValue("after" in r ? r.after : r.value)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		);

	return (
		<div
			className={cn(
				"rounded-md border p-3",
				tone === "add"
					? "border-emerald-500/40 bg-emerald-500/5"
					: "border-destructive/40 bg-destructive/5"
			)}
		>
			<p className="mb-2 text-xs font-medium text-muted-foreground">{TONE_HEADING[tone]}</p>
			<dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-4 gap-y-1 text-sm">
				{rows.map((r, i) => (
					<div key={`${r.label}-${i}`} className="contents">
						<dt className="text-muted-foreground">{r.label}</dt>
						<dd className={cn("min-w-0 break-words", tone === "remove" && "line-through")}>
							{formatAuditValue("value" in r ? r.value : r.after)}
						</dd>
					</div>
				))}
			</dl>
		</div>
	);
}
