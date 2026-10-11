import type { ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import z from "zod";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

const schema = z.object({
	reason: z.string().trim().min(1, "Reason is required").max(500, "Keep it under 500 characters"),
});

/** Reject a Change Request: reason required, shown to the submitter on My requests. */
export function RejectRequestDialog({
	open,
	onOpenChange,
	description,
	onReject,
	isPending = false,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	description?: ReactNode;
	onReject: (reason: string) => void;
	isPending?: boolean;
}) {
	const form = useForm<z.infer<typeof schema>>({
		resolver: zodResolver(schema),
		defaultValues: { reason: "" },
	});
	const handleOpenChange = (next: boolean) => {
		if (isPending) return;
		onOpenChange(next);
		if (!next) form.reset();
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit((v) => onReject(v.reason))}
						className="flex flex-col gap-6"
					>
						<DialogHeader>
							<DialogTitle>Reject request?</DialogTitle>
							{description ? <DialogDescription>{description}</DialogDescription> : null}
						</DialogHeader>
						<FormField
							control={form.control}
							name="reason"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Reason</FormLabel>
									<FormControl>
										<Textarea
											placeholder="Why is this request rejected?"
											rows={3}
											autoFocus
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								disabled={isPending}
								onClick={() => handleOpenChange(false)}
							>
								Cancel
							</Button>
							<Button type="submit" variant="destructive" disabled={isPending}>
								{isPending ? <Spinner /> : null}
								Reject
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
