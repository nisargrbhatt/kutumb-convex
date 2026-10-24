import { useState } from "react";
import { Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import type { ConnectionRow } from "@/domain/queries/connections";
import { ACCESS_OPTIONS } from "./AccessLevelCards";

const revokeCopy = (c: Pick<ConnectionRow, "clientName" | "orgName">) =>
	`${c.clientName} loses access to ${c.orgName} immediately. Reconnect from the client.`;

/**
 * Right drawer for one Connection. Write: "Make read only" (drops `community:write`, tokens stay).
 * Read: how to reconnect for write. Revoke lives here, behind a confirm dialog.
 */
export function ManageConnectionDrawer({
	connection,
	onClose,
	onRevoke,
	isRevoking,
	onDowngrade,
	isDowngrading,
}: {
	connection: ConnectionRow | null;
	onClose: () => void;
	onRevoke: (id: string) => Promise<unknown>;
	isRevoking: boolean;
	onDowngrade: (id: string) => Promise<unknown>;
	isDowngrading: boolean;
}) {
	const [confirmRevoke, setConfirmRevoke] = useState(false);

	return (
		<Sheet open={!!connection} onOpenChange={(open) => !open && onClose()}>
			<SheetContent
				side="right"
				className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
			>
				{connection ? (
					<>
						<SheetHeader className="border-b pr-12">
							<SheetTitle>{connection.clientName}</SheetTitle>
							<SheetDescription>
								{connection.orgName} · {ACCESS_OPTIONS[connection.access].title}
							</SheetDescription>
						</SheetHeader>
						<ScrollArea className="min-h-0 flex-1">
							<div className="flex flex-col gap-4 p-6 text-sm">
								{connection.access === "write" ? (
									<div className="flex flex-col gap-2 rounded-lg border p-3">
										<span className="font-medium">Stop changes, keep reading</span>
										<span className="text-xs text-muted-foreground">
											{connection.clientName} keeps reading but can't add or edit anything. To allow
											changes again, reconnect from the client.
										</span>
										<Button
											variant="outline"
											size="sm"
											className="self-start"
											disabled={isDowngrading}
											onClick={() => onDowngrade(connection.id).catch(() => {})}
										>
											{isDowngrading ? <Spinner /> : null}
											Make read only
										</Button>
									</div>
								) : (
									<div className="flex flex-col gap-2 rounded-lg border p-3">
										<span className="font-medium">Allow changes</span>
										<span className="text-xs text-muted-foreground">
											Reconnect from {connection.clientName}: remove and re-add Kutumb, then pick{" "}
											<b>Read and make changes</b>. The new connection takes over this one.
										</span>
									</div>
								)}
								<div className="flex flex-col gap-2 rounded-lg border border-destructive/30 p-3">
									<span className="font-medium">Revoke</span>
									<span className="text-xs text-muted-foreground">{revokeCopy(connection)}</span>
									<ConfirmDialog
										open={confirmRevoke}
										onOpenChange={setConfirmRevoke}
										trigger={
											<Button variant="destructive" size="sm" className="self-start">
												<Unplug className="size-4" /> Revoke
											</Button>
										}
										title="Revoke connection?"
										description={revokeCopy(connection)}
										confirmLabel="Revoke"
										destructive
										isPending={isRevoking}
										onConfirm={() =>
											onRevoke(connection.id).then(
												() => {
													setConfirmRevoke(false);
													onClose();
												},
												() => {}
											)
										}
									/>
								</div>
							</div>
						</ScrollArea>
					</>
				) : null}
			</SheetContent>
		</Sheet>
	);
}
