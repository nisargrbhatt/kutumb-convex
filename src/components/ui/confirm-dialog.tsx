import type { ReactElement, ReactNode } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";

/**
 * Confirmation for destructive / irreversible actions. Stays open while `onConfirm` runs;
 * the caller closes it (via `onOpenChange(false)`) on success.
 */
export function ConfirmDialog({
	open,
	onOpenChange,
	trigger,
	title,
	description,
	confirmLabel = "Confirm",
	destructive = false,
	onConfirm,
	isPending = false,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	trigger?: ReactElement;
	title: ReactNode;
	description?: ReactNode;
	confirmLabel?: ReactNode;
	destructive?: boolean;
	onConfirm: () => void;
	isPending?: boolean;
}) {
	return (
		<AlertDialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
			{trigger ? <AlertDialogTrigger render={trigger} /> : null}
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					{description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
					<AlertDialogAction
						variant={destructive ? "destructive" : "default"}
						disabled={isPending}
						onClick={onConfirm}
					>
						{isPending ? <Spinner /> : null}
						{confirmLabel}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
