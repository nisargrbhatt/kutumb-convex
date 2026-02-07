import { createOrganizationCheckoutLink } from "@/api/organization";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { safeAsync } from "@/lib/safe";
import { zodResolver } from "@hookform/resolvers/zod";
import { useId } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

const formSchema = z.object({
	name: z.string().trim().min(1, "Name is required"),
});

export function CreateOrganizationForm() {
	const formId = useId();

	const form = useForm<z.infer<typeof formSchema>>({
		defaultValues: {
			name: "",
		},
		resolver: zodResolver(formSchema),
	});

	const onSubmit = form.handleSubmit(async (values) => {
		const checkoutResult = await safeAsync(
			createOrganizationCheckoutLink({
				data: {
					name: values.name,
					successUrl: new URL("/onboard/organization", window.location.origin).toString(),
					cancelUrl: new URL("/onboard/organization", window.location.origin).toString(),
				},
			})
		);

		if (!checkoutResult.success) {
			console.error(checkoutResult.error);
			return;
		}

		window.location.href = checkoutResult.data.checkoutLink;
	});

	return (
		<Card className="w-full max-w-md">
			<CardHeader>
				<CardTitle>Create Organization</CardTitle>
				<CardDescription>
					Create your new organization or Ask org owner to invite you to organization
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Form {...form}>
					<form onSubmit={onSubmit} id={formId}>
						<div className="grid grid-cols-1 gap-6">
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Organization Name</FormLabel>
										<FormControl>
											<Input {...field} placeholder="Display Name" />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
					</form>
				</Form>
			</CardContent>
			<CardFooter>
				<CardAction>
					<Button form={formId} type="submit" onSubmit={onSubmit} disabled={form.formState.isSubmitting}>
						Submit
					</Button>
				</CardAction>
			</CardFooter>
		</Card>
	);
}
