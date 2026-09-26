import { useState, type ReactNode } from "react";
import { Heart, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { fullName } from "@/domain/communityProfile";
import { formatRelationType } from "@/domain/relation";

type Counterpart = {
	firstName: string;
	middleName: string | null;
	lastName: string;
	nickName: string | null;
} | null;

type RelationRow = {
	id: string;
	type: string | null;
	note: string | null;
	bloodRelation: boolean | null;
	toCommunityProfile?: Counterpart;
	fromCommunityProfile?: Counterpart;
};

const DIRECTION_ICON = { outgoing: <Users />, incoming: <Heart /> } as const;

const counterpartName = (c: Counterpart | undefined) =>
	c ? fullName(c) || c.nickName || "Unknown" : "Unknown";

/**
 * Relations of one profile in one direction. Outgoing rows show `to`, incoming rows show `from`
 * with the type as stored (ADR 0001). Only outgoing rows can be deleted (incoming are owned by
 * the counterpart); deletion is confirmed via `ConfirmDialog`.
 */
export function RelationsTable({
	title,
	description,
	direction,
	rows,
	emptyText,
	action,
	onDelete,
	isDeleting = false,
}: {
	title: string;
	description: string;
	direction: keyof typeof DIRECTION_ICON;
	rows: RelationRow[];
	emptyText: string;
	action?: ReactNode;
	onDelete?: (relationId: string) => Promise<unknown>;
	isDeleting?: boolean;
}) {
	const [deleteId, setDeleteId] = useState<string | null>(null);
	const icon = DIRECTION_ICON[direction];
	const canDelete = direction === "outgoing" && onDelete !== undefined;

	const confirmDelete = () => {
		if (!deleteId || !onDelete) return;
		// Errors are surfaced by the caller's mutation; keep the dialog open on failure.
		onDelete(deleteId).then(
			() => setDeleteId(null),
			() => {}
		);
	};

	return (
		<section className="flex w-full flex-col gap-3">
			<div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
				<div>
					<h2 className="flex items-center gap-2 text-lg font-medium">
						<span className="text-muted-foreground [&>svg]:size-5">{icon}</span>
						{title}
					</h2>
					<p className="text-sm text-muted-foreground">{description}</p>
				</div>
				{action ? <div className="shrink-0">{action}</div> : null}
			</div>

			{rows.length > 0 ? (
				<div className="w-full overflow-x-auto rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Relation</TableHead>
								<TableHead>Blood Relation</TableHead>
								<TableHead>Note</TableHead>
								{canDelete ? <TableHead className="w-0 text-right">Actions</TableHead> : null}
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((row) => {
								const name = counterpartName(
									direction === "outgoing" ? row.toCommunityProfile : row.fromCommunityProfile
								);
								return (
									<TableRow key={row.id}>
										<TableCell className="font-medium">{name}</TableCell>
										<TableCell>{formatRelationType(row.type)}</TableCell>
										<TableCell>
											{row.bloodRelation ? (
												<Badge variant="secondary">Blood</Badge>
											) : (
												<span className="text-muted-foreground">-</span>
											)}
										</TableCell>
										<TableCell className="text-muted-foreground">{row.note || "-"}</TableCell>
										{canDelete ? (
											<TableCell className="text-right">
												<Button
													variant="ghost"
													size="icon"
													aria-label={`Delete relation with ${name}`}
													onClick={() => setDeleteId(row.id)}
												>
													<Trash2 className="size-4 text-destructive" />
												</Button>
											</TableCell>
										) : null}
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
			) : (
				<Card className="rounded-lg border border-dashed">
					<CardContent className="flex flex-col items-center justify-center py-12 text-center">
						<div className="mb-4 rounded-full bg-muted/50 p-4 text-muted-foreground/50 [&>svg]:size-8">
							{icon}
						</div>
						<p className="max-w-sm text-sm text-muted-foreground">{emptyText}</p>
					</CardContent>
				</Card>
			)}

			{canDelete ? (
				<ConfirmDialog
					open={deleteId !== null}
					onOpenChange={(open) => !open && setDeleteId(null)}
					title="Delete relation"
					description="This removes the relation. This action cannot be undone."
					confirmLabel="Delete"
					destructive
					onConfirm={confirmDelete}
					isPending={isDeleting}
				/>
			) : null}
		</section>
	);
}
