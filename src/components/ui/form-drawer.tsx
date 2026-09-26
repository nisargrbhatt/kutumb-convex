import type { ReactElement, ReactNode } from "react";
import type { FieldValues, SubmitHandler, UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const SIZE_CLASS = {
	md: "data-[side=right]:sm:max-w-md",
	lg: "data-[side=right]:sm:max-w-2xl",
} as const;

/**
 * Right-side drawer for every create/edit surface: scrollable body, sticky Cancel/Submit footer.
 * Resets `form` to its defaults whenever the drawer closes.
 */
export function FormDrawer<TIn extends FieldValues, TOut = TIn>({
	open,
	onOpenChange,
	trigger,
	title,
	description,
	form,
	onSubmit,
	submitLabel,
	isPending,
	size = "md",
	children,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	trigger?: ReactElement;
	title: ReactNode;
	description?: ReactNode;
	// oxlint-disable-next-line no-explicit-any -- mirrors react-hook-form's own default
	form: UseFormReturn<TIn, any, TOut>;
	onSubmit: SubmitHandler<TOut>;
	submitLabel: ReactNode;
	isPending?: boolean;
	size?: keyof typeof SIZE_CLASS;
	children: ReactNode;
}) {
	const pending = isPending ?? form.formState.isSubmitting;

	const handleOpenChange = (next: boolean) => {
		onOpenChange(next);
		if (!next) form.reset();
	};

	return (
		<Sheet open={open} onOpenChange={handleOpenChange}>
			{trigger ? <SheetTrigger render={trigger} /> : null}
			<SheetContent side="right" className={cn("gap-0 data-[side=right]:w-full", SIZE_CLASS[size])}>
				<SheetHeader className="border-b pr-12">
					<SheetTitle>{title}</SheetTitle>
					{description ? <SheetDescription>{description}</SheetDescription> : null}
				</SheetHeader>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
						<ScrollArea className="min-h-0 flex-1">
							<div className="flex flex-col gap-4 p-6">{children}</div>
						</ScrollArea>
						<SheetFooter className="mt-0 flex-row justify-end border-t bg-popover">
							<Button
								type="button"
								variant="outline"
								disabled={pending}
								onClick={() => handleOpenChange(false)}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={pending}>
								{pending ? <Spinner /> : null}
								{submitLabel}
							</Button>
						</SheetFooter>
					</form>
				</Form>
			</SheetContent>
		</Sheet>
	);
}
