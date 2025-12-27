import { useForm } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
	Card,
	CardAction,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { useId } from "react";
import { Button } from "@/components/ui/button";
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
import { createProfile } from "@/api/profile";

const formSchema = z.object({
	displayName: z.string().trim().min(1, "Display name is required"),
	email: z.email().trim().min(1, "Email is required"),
});

interface Props {
	defaultEmail: string;
	handleSuccess: () => void;
}

export function CreateProfileForm({ defaultEmail, handleSuccess }: Props) {
	const formId = useId();

	const form = useForm<z.infer<typeof formSchema>>({
		defaultValues: {
			displayName: "",
			email: defaultEmail,
		},
		resolver: zodResolver(formSchema),
	});

	const onSubmit = form.handleSubmit(async (values) => {
		const result = await safeAsync(
			createProfile({
				data: values,
			})
		);

		if (!result.success) {
			console.error(result.error);
			return;
		}

		handleSuccess();
	});

	return (
		<Card className="w-full max-w-md">
			<CardHeader>
				<CardTitle>Create Profile</CardTitle>
			</CardHeader>
			<CardContent>
				<Form {...form}>
					<form onSubmit={onSubmit} id={formId}>
						<div className="grid grid-cols-1 gap-6">
							<FormField
								control={form.control}
								name="displayName"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Display Name</FormLabel>
										<FormControl>
											<Input {...field} placeholder="Display Name" />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="email"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Email</FormLabel>
										<FormControl>
											<Input {...field} placeholder="Email" />
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
					<Button
						form={formId}
						type="submit"
						onSubmit={onSubmit}
						disabled={form.formState.isSubmitting}
					>
						Submit
					</Button>
				</CardAction>
			</CardFooter>
		</Card>
	);
}
