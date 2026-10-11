import { z } from "zod";
import { COMMUNITY_ADDRESS_TYPE } from "@/db/constants";
import type { AddressInput } from "@/domain/profileChanges";

export const addressTypeSchema = z.enum(COMMUNITY_ADDRESS_TYPE);

const nullableText = z.string().trim().min(1).nullable();

/** Wire shape: every key present, optional columns `null` when blank (mirrors profile input). */
export const addressInput = z.object({
	line1: z.string().trim().min(1, "Line 1 is required"),
	line2: nullableText,
	country: z.string().trim().min(1, "Country is required"),
	state: z.string().trim().min(1, "State is required"),
	city: z.string().trim().min(1, "City is required"),
	postalCode: z.string().trim().min(1, "Postal code is required"),
	type: addressTypeSchema.nullable(),
	note: nullableText,
	digipin: nullableText,
}) satisfies z.ZodType<AddressInput>;

/** react-hook-form shape: inputs hold `""`. */
export const addressFormSchema = z.object({
	line1: z.string().trim().min(1, "Line 1 is required"),
	line2: z.string().optional(),
	country: z.string().trim().min(1, "Country is required"),
	state: z.string().trim().min(1, "State is required"),
	city: z.string().trim().min(1, "City is required"),
	postalCode: z.string().trim().min(1, "Postal code is required"),
	type: addressTypeSchema.optional(),
	note: z.string().optional(),
	digipin: z.string().optional(),
});
export type AddressFormValues = z.infer<typeof addressFormSchema>;

const blankToNull = (v: string | null | undefined) => {
	const t = v?.trim();
	return t ? t : null;
};

export const toAddressInput = (v: AddressFormValues): AddressInput => ({
	line1: v.line1.trim(),
	line2: blankToNull(v.line2),
	country: v.country.trim(),
	state: v.state.trim(),
	city: v.city.trim(),
	postalCode: v.postalCode.trim(),
	type: v.type ?? null,
	note: blankToNull(v.note),
	digipin: blankToNull(v.digipin),
});

export const toAddressFormValues = (row?: Partial<AddressInput> | null): AddressFormValues => ({
	line1: row?.line1 ?? "",
	line2: row?.line2 ?? "",
	country: row?.country ?? "",
	state: row?.state ?? "",
	city: row?.city ?? "",
	postalCode: row?.postalCode ?? "",
	type: row?.type ?? COMMUNITY_ADDRESS_TYPE.home,
	note: row?.note ?? "",
	digipin: row?.digipin ?? "",
});
