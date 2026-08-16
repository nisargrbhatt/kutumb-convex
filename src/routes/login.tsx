import { createFileRoute } from "@tanstack/react-router";
import { useId } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";
import { usePostHog } from "@posthog/react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { RootLayout } from "@/components/RootLayout";
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";
import { OAuthErrorAlert } from "@/components/auth/OAuthErrorAlert";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Form } from "@/components/ui/form";
import { authSearchSchema, buildAuthCallbackPath } from "@/lib/auth-search-params";

const loginSchema = z.object({
	email: z.email("Enter a valid email address."),
	password: z.string().min(1, "Password is required."),
});

export const Route = createFileRoute("/login")({
	component: RouteComponent,
	validateSearch: authSearchSchema,
	head: () => ({
		meta: [
			{
				title: "Login | Kutumb App",
			},
		],
	}),
});

function RouteComponent() {
	const { redirectTo, invitation, error } = Route.useSearch();
	const navigate = Route.useNavigate();
	const posthog = usePostHog();
	const formId = useId();

	const form = useForm<z.infer<typeof loginSchema>>({
		defaultValues: { email: "", password: "" },
		resolver: zodResolver(loginSchema),
	});

	const destination = redirectTo || "/dashboard";

	const onSubmit = form.handleSubmit(async (values) => {
		posthog.capture("sign_in_initiated", { provider: "email" });

		const { error: signInError } = await authClient.signIn.email({
			email: values.email,
			password: values.password,
			callbackURL: destination,
		});

		if (signInError) {
			toast.error("Sign in failed", { description: "Invalid email or password." });
			return;
		}

		navigate({ to: destination });
	});

	return (
		<RootLayout>
			<div className="flex h-full w-full items-center justify-center py-10">
				<Card className="w-full max-w-sm">
					<CardHeader>
						<CardTitle className="text-lg md:text-xl">Sign In</CardTitle>
						<CardDescription className="text-xs md:text-sm">
							Enter your email below to login to your account
						</CardDescription>
					</CardHeader>
					<CardContent>
						<FieldGroup>
							<OAuthErrorAlert error={error} />
							<Form {...form}>
								<form onSubmit={onSubmit} id={formId}>
									<FieldGroup>
										<Controller
											control={form.control}
											name="email"
											render={({ field, fieldState }) => (
												<Field data-invalid={fieldState.invalid}>
													<FieldLabel htmlFor="login-email">Email</FieldLabel>
													<Input
														{...field}
														id="login-email"
														type="email"
														autoComplete="email"
														aria-invalid={fieldState.invalid}
														placeholder="you@example.com"
													/>
													{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
												</Field>
											)}
										/>
										<Controller
											control={form.control}
											name="password"
											render={({ field, fieldState }) => (
												<Field data-invalid={fieldState.invalid}>
													<div className="flex items-center justify-between">
														<FieldLabel htmlFor="login-password">Password</FieldLabel>
														<Route.Link
															to="/forgot-password"
															className="link text-xs text-muted-foreground"
														>
															Forgot password?
														</Route.Link>
													</div>
													<Input
														{...field}
														id="login-password"
														type="password"
														autoComplete="current-password"
														aria-invalid={fieldState.invalid}
													/>
													{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
												</Field>
											)}
										/>
									</FieldGroup>
								</form>
							</Form>
							<Field orientation="horizontal">
								<Button
									type="submit"
									form={formId}
									className="w-full"
									disabled={form.formState.isSubmitting}
								>
									Sign in
								</Button>
							</Field>
							<FieldSeparator>Or</FieldSeparator>
							<Field orientation="horizontal">
								<GoogleAuthButton
									mode="sign_in"
									destination={destination}
									errorCallbackURL={buildAuthCallbackPath("/login", { redirectTo, invitation })}
								/>
							</Field>
						</FieldGroup>
					</CardContent>
					<CardFooter>
						<FieldDescription className="text-center">
							New here?{" "}
							<Route.Link to="/signup" search={{ redirectTo, invitation }} className="link">
								Create an account
							</Route.Link>
						</FieldDescription>
					</CardFooter>
				</Card>
			</div>
		</RootLayout>
	);
}
