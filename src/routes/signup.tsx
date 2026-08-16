import { createFileRoute } from "@tanstack/react-router";
import { useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";
import { usePostHog } from "@posthog/react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { getSignupGateStateFn } from "@/handler/auth";
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
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { authSearchSchema, buildAuthCallbackPath } from "@/lib/auth-search-params";
import { AUTH_COPY, SIGNUP_EMAIL_COLLISION_CODE } from "@/lib/auth-copy";

const signupSchema = z
	.object({
		name: z.string().trim().min(1, "Name is required."),
		email: z.email("Enter a valid email address."),
		password: z.string().min(8, "Password must be at least 8 characters."),
		confirmPassword: z.string().min(1, "Confirm your password."),
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: "Passwords do not match.",
		path: ["confirmPassword"],
	});

export const Route = createFileRoute("/signup")({
	component: RouteComponent,
	validateSearch: authSearchSchema,
	loaderDeps: ({ search }) => ({ invitation: search.invitation }),
	loader: async ({ deps }) => getSignupGateStateFn({ data: { invitationId: deps.invitation } }),
	head: () => ({
		meta: [
			{
				title: "Sign Up | Kutumb App",
			},
		],
	}),
});

function RouteComponent() {
	const { redirectTo, invitation, error } = Route.useSearch();
	const { signupDisabled, invitedEmail } = Route.useLoaderData();
	const navigate = Route.useNavigate();
	const posthog = usePostHog();
	const formId = useId();

	const [emailCollision, setEmailCollision] = useState(false);

	const destination = redirectTo || "/dashboard";
	const errorCallbackURL = buildAuthCallbackPath("/signup", { redirectTo, invitation });

	const form = useForm<z.infer<typeof signupSchema>>({
		defaultValues: {
			name: "",
			email: invitedEmail ?? "",
			password: "",
			confirmPassword: "",
		},
		resolver: zodResolver(signupSchema),
	});

	const onSubmit = form.handleSubmit(async (values) => {
		setEmailCollision(false);
		posthog.capture("sign_up_initiated", { provider: "email" });

		const { error: signUpError } = await authClient.signUp.email({
			name: values.name,
			email: values.email,
			password: values.password,
			callbackURL: destination,
		});

		if (signUpError) {
			if (signUpError.code === SIGNUP_EMAIL_COLLISION_CODE) {
				setEmailCollision(true);
				return;
			}
			toast.error("Sign up failed", { description: "Please try again later." });
			return;
		}

		navigate({ to: destination });
	});

	if (signupDisabled) {
		return (
			<RootLayout>
				<div className="flex h-full w-full items-center justify-center py-10">
					<Card className="w-full max-w-sm">
						<CardHeader>
							<CardTitle className="text-lg md:text-xl">Sign Up</CardTitle>
						</CardHeader>
						<CardContent>
							<Alert>
								<AlertDescription>{AUTH_COPY.signupsClosed}</AlertDescription>
							</Alert>
						</CardContent>
						<CardFooter>
							<FieldDescription className="text-center">
								<Route.Link to="/login" search={{ redirectTo, invitation }} className="link">
									Back to sign in
								</Route.Link>
							</FieldDescription>
						</CardFooter>
					</Card>
				</div>
			</RootLayout>
		);
	}

	return (
		<RootLayout>
			<div className="flex h-full w-full items-center justify-center py-10">
				<Card className="w-full max-w-sm">
					<CardHeader>
						<CardTitle className="text-lg md:text-xl">Create an account</CardTitle>
						<CardDescription className="text-xs md:text-sm">
							Enter your details below to create your account
						</CardDescription>
					</CardHeader>
					<CardContent>
						<FieldGroup>
							{emailCollision ? (
								<Alert variant="destructive">
									<AlertDescription>{AUTH_COPY.emailCollision}</AlertDescription>
									<AlertAction>
										<Route.Link
											to="/login"
											search={{ redirectTo, invitation }}
											className="link text-xs"
										>
											Sign in
										</Route.Link>
									</AlertAction>
								</Alert>
							) : null}
							<OAuthErrorAlert error={error} />
							<Form {...form}>
								<form onSubmit={onSubmit} id={formId}>
									<FieldGroup>
										<Controller
											control={form.control}
											name="name"
											render={({ field, fieldState }) => (
												<Field data-invalid={fieldState.invalid}>
													<FieldLabel htmlFor="signup-name">Name</FieldLabel>
													<Input
														{...field}
														id="signup-name"
														autoComplete="name"
														aria-invalid={fieldState.invalid}
														placeholder="Ada Lovelace"
													/>
													{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
												</Field>
											)}
										/>
										<Controller
											control={form.control}
											name="email"
											render={({ field, fieldState }) => (
												<Field data-invalid={fieldState.invalid}>
													<FieldLabel htmlFor="signup-email">Email</FieldLabel>
													<Input
														{...field}
														id="signup-email"
														type="email"
														autoComplete="email"
														disabled={!!invitedEmail}
														aria-invalid={fieldState.invalid}
														placeholder="you@example.com"
													/>
													{invitedEmail ? (
														<FieldDescription>
															You're accepting an invite sent to this email.
														</FieldDescription>
													) : null}
													{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
												</Field>
											)}
										/>
										<Controller
											control={form.control}
											name="password"
											render={({ field, fieldState }) => (
												<Field data-invalid={fieldState.invalid}>
													<FieldLabel htmlFor="signup-password">Password</FieldLabel>
													<Input
														{...field}
														id="signup-password"
														type="password"
														autoComplete="new-password"
														aria-invalid={fieldState.invalid}
													/>
													<FieldDescription>At least 8 characters.</FieldDescription>
													{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
												</Field>
											)}
										/>
										<Controller
											control={form.control}
											name="confirmPassword"
											render={({ field, fieldState }) => (
												<Field data-invalid={fieldState.invalid}>
													<FieldLabel htmlFor="signup-confirm-password">
														Confirm password
													</FieldLabel>
													<Input
														{...field}
														id="signup-confirm-password"
														type="password"
														autoComplete="new-password"
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
									Create account
								</Button>
							</Field>
							<FieldSeparator>Or</FieldSeparator>
							<Field orientation="horizontal">
								<GoogleAuthButton
									mode="sign_up"
									destination={destination}
									errorCallbackURL={errorCallbackURL}
								/>
							</Field>
						</FieldGroup>
					</CardContent>
					<CardFooter>
						<FieldDescription className="text-center">
							Already have an account?{" "}
							<Route.Link to="/login" search={{ redirectTo, invitation }} className="link">
								Sign in
							</Route.Link>
						</FieldDescription>
					</CardFooter>
				</Card>
			</div>
		</RootLayout>
	);
}
