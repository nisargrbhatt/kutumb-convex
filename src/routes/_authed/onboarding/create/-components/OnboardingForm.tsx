import { cn } from "@/lib/utils";
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
import z from "zod";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form } from "@/components/ui/form";
import { useId } from "react";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { Link, useRouter } from "@tanstack/react-router";
import { usePostHog } from "@posthog/react";

const formSchema = z.object({
	name: z
		.string()
		.trim()
		.min(3, "Organization name must be at least 3 characters.")
		.max(25, "Organization name must be at most 25 characters.")
		.regex(
			/^[a-zA-Z0-9_ ]+$/,
			"Organization name can only contain letters, numbers, spaces and underscores."
		),
	slug: z
		.string()
		.trim()
		.min(3, "Organization slug must be at least 3 characters.")
		.max(10, "Organization slug must be at most 10 characters.")
		.regex(/^[a-zA-Z0-9-]+$/, "Organization slug can only contain letters, numbers, and dashes."),
});

export function OnboardingForm() {
	const router = useRouter();
	const formId = useId();
	const posthog = usePostHog();

	const form = useForm<z.infer<typeof formSchema>>({
		defaultValues: {
			name: "",
			slug: "",
		},
		resolver: zodResolver(formSchema),
	});

	const onSubmit = form.handleSubmit(async (values) => {
		const { data } = await authClient.organization.checkSlug({
			slug: values.slug,
		});

		if (!data) {
			posthog.capture("organization_create_failed", {
				reason: "slug_conflict",
				slug: values.slug,
			});
			toast.error("Organization slug already exist", {
				description: "Please try another slug.",
			});
			form.setError("slug", {
				message: "Organization slug already exist. Try another",
			});
			return;
		}
		if (data?.status === false) {
			posthog.capture("organization_create_failed", {
				reason: "slug_conflict",
				slug: values.slug,
			});
			toast.error("Organization slug already exist", {
				description: "Please try another slug.",
			});
			form.setError("slug", {
				message: "Organization slug already exist. Try another",
			});
			return;
		}

		const { error: createOrgError } = await authClient.organization.create({
			name: values.name,
			slug: values.slug,
			keepCurrentActiveOrganization: false,
			metadata: {},
		});

		if (createOrgError) {
			posthog.capture("organization_create_failed", {
				reason: "server_error",
				name: values.name,
				slug: values.slug,
			});
			toast.error("Failed to create organization", {
				description: "Please try again later.",
			});
			return;
		}

		posthog.capture("organization_created", {
			organization_name: values.name,
			organization_slug: values.slug,
		});

		toast.success("Organization created successfully", {
			description: "You can now access your organization. Redirecting you to dashboard",
		});

		router.navigate({
			to: "/dashboard",
		});
	});

	return (
		<div className={cn("flex flex-col gap-6")}>
			<Card>
				<CardHeader className="text-center">
					<CardTitle className="text-xl">Create your organization</CardTitle>
					<CardDescription>
						Enter your organization details below to create your organization. or ask organization
						admin to{" "}
						<Link className="link" to={"/onboarding/invitations"} title="My Org Invitations">
							invite
						</Link>{" "}
						you.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Form {...form}>
						<form onSubmit={onSubmit} id={formId}>
							<FieldGroup>
								<Controller
									control={form.control}
									name="name"
									render={({ field, fieldState }) => (
										<Field data-invalid={fieldState.invalid}>
											<FieldLabel htmlFor="form-rhf-input-name">Organization Name</FieldLabel>
											<Input
												{...field}
												id="form-rhf-input-name"
												aria-invalid={fieldState.invalid}
												placeholder="Ex. Acme"
											/>
											{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
										</Field>
									)}
								/>
								<Controller
									control={form.control}
									name="slug"
									render={({ field, fieldState }) => (
										<Field data-invalid={fieldState.invalid}>
											<FieldLabel htmlFor="form-rhf-input-slug">Organization Slug</FieldLabel>
											<Input
												{...field}
												id="form-rhf-input-slug"
												aria-invalid={fieldState.invalid}
												placeholder="Ex. acme-123"
											/>
											<FieldDescription>
												This is your public display name. Must be between 3 and 10 characters. Must
												only contain letters, numbers, and dashes.
											</FieldDescription>
											{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
										</Field>
									)}
								/>
							</FieldGroup>
						</form>
					</Form>
				</CardContent>
				<CardFooter>
					<Field orientation="horizontal">
						<Button
							type="submit"
							form={formId}
							className="w-full"
							disabled={form.formState.isSubmitting}
						>
							Create
						</Button>
					</Field>
				</CardFooter>
			</Card>
			<FieldDescription className="px-6 text-center">
				By clicking continue, you agree to our <a href="#">Terms of Service</a> and{" "}
				<a href="#">Privacy Policy</a>.
			</FieldDescription>
		</div>
	);
}
