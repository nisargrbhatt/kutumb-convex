import { Badge } from "@/components/ui/badge";
import type { ChangeRequestKind, ChangeRequestStatus } from "@/domain/changeRequest";
import { diffRows, formatAuditValue } from "@/domain/audit";
import { CHANGE_REQUEST_KIND_LABEL } from "@/domain/memberRequests";

/**
 * A Change Request's payload as before/after rows (`info`, `address_edit`) or the values it adds /
 * removes (snapshots). `create` has no payload: the draft profile itself is judged.
 */
export function RequestDiff({ kind, payload }: { kind: ChangeRequestKind; payload: unknown }) {
	if (kind === "create")
		return (
			<p className="text-sm text-muted-foreground">
				A new profile, saved as a draft until reviewed.
			</p>
		);
	const rows = diffRows(payload);
	if (rows.length === 0) return <p className="text-sm text-muted-foreground">No details.</p>;
	const isChange = rows.some((r) => "before" in r);
	const valueHeading = kind.endsWith("_remove") ? "To remove" : "To add";

	return (
		<div className="overflow-x-auto rounded-md border">
			<table className="w-full text-sm">
				<thead className="bg-muted/50 text-left text-xs text-muted-foreground">
					<tr>
						<th scope="col" className="p-2 font-medium">
							Field
						</th>
						{isChange ? (
							<>
								<th scope="col" className="p-2 font-medium">
									Before
								</th>
								<th scope="col" className="p-2 font-medium">
									Proposed
								</th>
							</>
						) : (
							<th scope="col" className="p-2 font-medium">
								{valueHeading}
							</th>
						)}
					</tr>
				</thead>
				<tbody>
					{rows.map((r, i) => (
						<tr key={`${r.label}-${i}`} className="border-t align-top">
							<th scope="row" className="p-2 text-left font-medium">
								{r.label}
							</th>
							{"value" in r ? (
								<td className="p-2 break-words" colSpan={isChange ? 2 : 1}>
									{formatAuditValue(r.value)}
								</td>
							) : (
								<>
									<td className="p-2 break-words text-muted-foreground line-through decoration-destructive/60">
										{formatAuditValue(r.before)}
									</td>
									<td className="bg-emerald-500/10 p-2 break-words">
										{formatAuditValue(r.after)}
									</td>
								</>
							)}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

export function RequestKindBadge({ kind }: { kind: ChangeRequestKind }) {
	return (
		<Badge variant={kind === "create" ? "default" : "secondary"} className="whitespace-nowrap">
			{CHANGE_REQUEST_KIND_LABEL[kind]}
		</Badge>
	);
}

const STATUS_VARIANT: Record<
	ChangeRequestStatus,
	"default" | "secondary" | "destructive" | "outline"
> = {
	pending: "outline",
	approved: "default",
	rejected: "destructive",
	withdrawn: "secondary",
	superseded: "secondary",
};

export function RequestStatusBadge({ status }: { status: ChangeRequestStatus }) {
	return (
		<Badge variant={STATUS_VARIANT[status]} className="capitalize">
			{status}
		</Badge>
	);
}
