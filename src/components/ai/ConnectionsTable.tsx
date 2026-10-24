import { useState } from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { Bot, Eye, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { ConnectionStatus } from "@/domain/connections";
import type { ConnectionRow } from "@/domain/queries/connections";
import { cn } from "@/lib/utils";
import { ACCESS_OPTIONS } from "./AccessLevelCards";
import { ManageConnectionDrawer } from "./ManageConnectionDrawer";

const STATUS_CLASS: Record<ConnectionStatus, string> = {
	active:
		"border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
	expired:
		"border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
};

function StatusBadge({ status }: { status: ConnectionStatus }) {
	return (
		<Badge variant="outline" className={cn("capitalize", STATUS_CLASS[status])}>
			{status}
		</Badge>
	);
}

const fullDate = (ms: number) => new Date(ms).toString();

/**
 * The caller's Connections. Community is its own column from `sm` up; below that it folds into the
 * client cell. Access (Eye + amber Pencil, subline) comes from live consent scopes; Manage opens
 * the right drawer (Make read only / reconnect info / Revoke).
 */
export function ConnectionsTable({
	rows,
	emptyText,
	onRevoke,
	isRevoking,
	onDowngrade,
	isDowngrading,
}: {
	rows: ConnectionRow[];
	emptyText: string;
	onRevoke: (id: string) => Promise<unknown>;
	isRevoking: boolean;
	onDowngrade: (id: string) => Promise<unknown>;
	isDowngrading: boolean;
}) {
	const [manageId, setManageId] = useState<string | null>(null);
	// Derived from rows so the drawer follows refetches (access flips to read) and closes when the
	// Connection disappears.
	const managed = rows.find((r) => r.id === manageId) ?? null;

	return (
		<div className="w-full overflow-x-auto rounded-lg border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>AI Client</TableHead>
						<TableHead className="hidden sm:table-cell">Community</TableHead>
						<TableHead className="hidden md:table-cell">Connected</TableHead>
						<TableHead>Last used</TableHead>
						<TableHead>Status</TableHead>
						<TableHead className="text-right">Manage</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.length === 0 ? (
						<TableRow>
							<TableCell colSpan={6} className="h-32">
								<div className="flex flex-col items-center justify-center gap-2 text-center text-muted-foreground">
									<Bot className="size-8 text-muted-foreground/50" />
									<p>{emptyText}</p>
								</div>
							</TableCell>
						</TableRow>
					) : (
						rows.map((c) => (
							<TableRow key={c.id}>
								<TableCell>
									<div className="flex min-w-0 flex-col items-start gap-0.5">
										<div className="flex items-center gap-2">
											<span className="font-medium">{c.clientName}</span>
											<span className="flex items-center gap-0.5 text-muted-foreground">
												<Eye className="size-3.5" aria-label="Can read" />
												{c.access === "write" ? (
													<Pencil
														className="size-3.5 text-amber-600 dark:text-amber-400"
														aria-label="Can make changes"
													/>
												) : null}
											</span>
										</div>
										<span className="text-xs text-muted-foreground">
											{ACCESS_OPTIONS[c.access].title}
										</span>
										{c.host ? (
											<span className="text-xs text-muted-foreground">{c.host}</span>
										) : null}
										<span className="text-xs text-muted-foreground sm:hidden">{c.orgName}</span>
									</div>
								</TableCell>
								<TableCell className="hidden sm:table-cell">{c.orgName}</TableCell>
								<TableCell className="hidden md:table-cell" title={fullDate(c.connectedAt)}>
									{format(c.connectedAt, "d MMM yyyy")}
								</TableCell>
								<TableCell title={c.lastUsedAt ? fullDate(c.lastUsedAt) : undefined}>
									{c.lastUsedAt
										? formatDistanceToNowStrict(c.lastUsedAt, { addSuffix: true })
										: "Never"}
								</TableCell>
								<TableCell>
									<StatusBadge status={c.status} />
								</TableCell>
								<TableCell className="text-right">
									<Button
										variant="outline"
										size="sm"
										aria-label={`Manage ${c.clientName} in ${c.orgName}`}
										onClick={() => setManageId(c.id)}
									>
										Manage
									</Button>
								</TableCell>
							</TableRow>
						))
					)}
				</TableBody>
			</Table>
			<ManageConnectionDrawer
				connection={managed}
				onClose={() => setManageId(null)}
				onRevoke={onRevoke}
				isRevoking={isRevoking}
				onDowngrade={onDowngrade}
				isDowngrading={isDowngrading}
			/>
		</div>
	);
}
