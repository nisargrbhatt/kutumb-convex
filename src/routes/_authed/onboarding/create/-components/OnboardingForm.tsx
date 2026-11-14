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
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form } from "@/components/ui/form";
import { useId } from "react";
import { Link } from "@tanstack/react-router";
import { isSlugTaken, useCreateOrganization } from "@/queries/organization";
import type { ReactNode } from "react";
import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxList,
} from "@/components/ui/combobox";
import { BILLING_COUNTRIES, countryName } from "@/domain/countries";
import { createOrganizationSchema, type CreateOrganizationInput } from "@/domain/organization";

/** Sorted by English name for the picker. */
const COUNTRY_CODES = [...BILLING_COUNTRIES].sort((a, b) =>
	countryName(a).localeCompare(countryName(b))
);

type OnboardingFormProps = {
	titleAdornment?: ReactNode;
	beforeForm?: ReactNode;
	disabled?: boolean;
};

export function OnboardingForm({ titleAdornment, beforeForm, disabled }: OnboardingFormProps = {}) {
	const formId = useId();
	const createOrg = useCreateOrganization();

	const form = useForm<CreateOrganizationInput>({
		defaultValues: {
			name: "",
			slug: "",
			country: undefined,
		},
		resolver: zodResolver(createOrganizationSchema),
	});

	const onSubmit = form.handleSubmit((values) =>
		createOrg.mutateAsync(values).catch((error) => {
			if (isSlugTaken(error)) {
				form.setError("slug", { message: "Organization slug already exist. Try another" });
			}
		})
	);

	return (
		<div className={cn("flex flex-col gap-6")}>
			<Card>
				<CardHeader className="text-center">
					<CardTitle className="flex items-center justify-center gap-2 text-xl">
						Create your organization {titleAdornment}
					</CardTitle>
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
					{beforeForm}
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
								<Controller
									control={form.control}
									name="country"
									render={({ field, fieldState }) => (
										<Field data-invalid={fieldState.invalid}>
											<FieldLabel htmlFor="form-rhf-input-country">Country</FieldLabel>
											<Combobox
												items={COUNTRY_CODES}
												itemToStringLabel={(code: string) => (code ? countryName(code) : "")}
												value={field.value ?? null}
												onValueChange={(code) => field.onChange(code ?? undefined)}
											>
												<ComboboxInput
													id="form-rhf-input-country"
													placeholder="Select a country"
													aria-invalid={fieldState.invalid}
													onBlur={field.onBlur}
												/>
												<ComboboxContent>
													<ComboboxEmpty>No countries found.</ComboboxEmpty>
													<ComboboxList>
														{(code: string) => (
															<ComboboxItem key={code} value={code}>
																{countryName(code)}
															</ComboboxItem>
														)}
													</ComboboxList>
												</ComboboxContent>
											</Combobox>
											<FieldDescription>Used for billing and tax.</FieldDescription>
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
							disabled={form.formState.isSubmitting || disabled}
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
