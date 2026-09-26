import { createFileRoute } from "@tanstack/react-router";
import { useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";
import { usePostHog } from "@posthog/react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { AuthCardShell } from "@/components/auth/AuthCardShell";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Form } from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RESET_PASSWORD_INVALID_TOKEN_CODE } from "@/lib/auth-copy";
import { LOGIN_PATH } from "@/domain/authRoutes";

const resetPasswordSchema = z.object({
	newPassword: z.string().min(8, "Password must be at least 8 characters."),
});

export const Route = createFileRoute("/reset-password")({
	component: RouteComponent,
	// `token` and `error` both arrive from better-auth's own GET `/reset-password/:token`
	// redirect (password.mjs `requestPasswordResetCallback`), not from anything this app
	// controls — an expired/already-clicked link redirects here with `?error=INVALID_TOKEN`
	// and no token, before the form is ever shown.
	validateSearch: z.object({
		token: z.string().trim().optional(),
		error: z.string().trim().optional(),
	}),
	head: () => ({
		meta: [
			{
				title: "Reset Password | Kutumb App",
			},
		],
	}),
});

function InvalidLinkCard() {
	return (
		<AuthCardShell
			title="Reset your password"
			footer={
				<Route.Link to="/forgot-password" className="link">
					Request a new link
				</Route.Link>
			}
		>
			<Alert variant="destructive">
				<AlertDescription>This reset link is invalid or has expired.</AlertDescription>
			</Alert>
		</AuthCardShell>
	);
}

function RouteComponent() {
	const { token, error } = Route.useSearch();
	const navigate = Route.useNavigate();
	const posthog = usePostHog();
	const formId = useId();
	const [invalidToken, setInvalidToken] = useState(false);

	const form = useForm<z.infer<typeof resetPasswordSchema>>({
		defaultValues: { newPassword: "" },
		resolver: zodResolver(resetPasswordSchema),
	});

	if (!token || error || invalidToken) {
		return <InvalidLinkCard />;
	}

	const onSubmit = form.handleSubmit(async (values) => {
		const { error: resetError } = await authClient.resetPassword({
			newPassword: values.newPassword,
			token,
		});

		if (resetError) {
			if (resetError.code === RESET_PASSWORD_INVALID_TOKEN_CODE) {
				setInvalidToken(true);
				return;
			}
			toast.error("Failed to reset password", { description: "Please try again later." });
			return;
		}

		posthog.capture("password_reset_completed");
		toast.success("Password reset", { description: "Sign in with your new password." });
		navigate({ to: LOGIN_PATH });
	});

	return (
		<AuthCardShell
			title="Reset your password"
			description="Choose a new password for your account."
			footer={
				<Route.Link to={LOGIN_PATH} className="link">
					Back to sign in
				</Route.Link>
			}
		>
			<FieldGroup>
				<Form {...form}>
					<form onSubmit={onSubmit} id={formId}>
						<Controller
							control={form.control}
							name="newPassword"
							render={({ field, fieldState }) => (
								<Field data-invalid={fieldState.invalid}>
									<FieldLabel htmlFor="reset-password-new">New password</FieldLabel>
									<Input
										{...field}
										id="reset-password-new"
										type="password"
										autoComplete="new-password"
										aria-invalid={fieldState.invalid}
									/>
									<FieldDescription>At least 8 characters.</FieldDescription>
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
						Reset password
					</Button>
				</Field>
			</FieldGroup>
		</AuthCardShell>
	);
}
