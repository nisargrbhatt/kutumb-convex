import z from "zod";
import { BILLING_COUNTRIES } from "./countries";

/** Org create form + `createOrganizationFn` input. `country` = Dodo billing country (ADR 0013). */
export const createOrganizationSchema = z.object({
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
	country: z.enum(BILLING_COUNTRIES, { error: "Select a country." }),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

/** `AppError` code: slug already used by another org. */
export const SLUG_TAKEN = "SLUG_TAKEN";
