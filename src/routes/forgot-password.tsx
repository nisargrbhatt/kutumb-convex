import { createFileRoute } from "@tanstack/react-router";
import { useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";
import { usePostHog } from "@posthog/react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { RootLayout } from "@/components/RootLayout";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Form } from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AUTH_COPY } from "@/lib/auth-copy";

const forgotPasswordSchema = z.object({
	email: z.email("Enter a valid email address."),
});

export const Route = createFileRoute("/forgot-password")({
	component: RouteComponent,
	head: () => ({
		meta: [
			{
				title: "Forgot Password | Kutumb App",
			},
		],
	}),
});

function RouteComponent() {
	const posthog = usePostHog();
	const formId = useId();
	const [requested, setRequested] = useState(false);

	const form = useForm<z.infer<typeof forgotPasswordSchema>>({
		defaultValues: { email: "" },
		resolver: zodResolver(forgotPasswordSchema),
	});

	const onSubmit = form.handleSubmit(async (values) => {
		posthog.capture("password_reset_requested");

		const { error } = await authClient.requestPasswordReset({
			email: values.email,
			redirectTo: "/reset-password",
		});

		if (error) {
			toast.error("Something went wrong", { description: "Please try again later." });
			return;
		}

		setRequested(true);
	});

	return (
		<RootLayout>
			<div className="flex h-full w-full items-center justify-center py-10">
				<Card className="w-full max-w-sm">
					<CardHeader>
						<CardTitle className="text-lg md:text-xl">Reset your password</CardTitle>
						<CardDescription className="text-xs md:text-sm">
							Enter your email and we'll send you a link to reset your password.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{requested ? (
							<Alert>
								<AlertDescription>{AUTH_COPY.resetRequested}</AlertDescription>
							</Alert>
						) : (
							<FieldGroup>
								<Form {...form}>
									<form onSubmit={onSubmit} id={formId}>
										<Controller
											control={form.control}
											name="email"
											render={({ field, fieldState }) => (
												<Field data-invalid={fieldState.invalid}>
													<FieldLabel htmlFor="forgot-password-email">Email</FieldLabel>
													<Input
														{...field}
														id="forgot-password-email"
														type="email"
														autoComplete="email"
														aria-invalid={fieldState.invalid}
														placeholder="you@example.com"
													/>
													{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
												</Field>
											)}
										/>
									</form>
								</Form>
								<Field orientation="horizontal">
									<Button
										type="submit"
										form={formId}
										className="w-full"
										disabled={form.formState.isSubmitting}
									>
										Send reset link
									</Button>
								</Field>
							</FieldGroup>
						)}
					</CardContent>
					<CardFooter>
						<FieldDescription className="text-center">
							<Route.Link to="/login" className="link">
								Back to sign in
							</Route.Link>
						</FieldDescription>
					</CardFooter>
				</Card>
			</div>
		</RootLayout>
	);
}
