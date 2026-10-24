import { format, isValid } from "date-fns";
import { z } from "zod";
import { CUSTOM_FIELD_TYPE } from "@/db/constants";
import { CUSTOM_FIELD_LIMIT } from "./limits";

export const customFieldTypeSchema = z.enum(CUSTOM_FIELD_TYPE);
export type CustomFieldType = z.infer<typeof customFieldTypeSchema>;

export type CustomFieldDefinition = { id: string; label: string; type: CustomFieldType };

export const CUSTOM_FIELD_TEXT_MAX = 500;

/** Shape of a stored value; no length bound, so legacy long text still reads back. */
export const storedCustomFieldValueSchema = z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.null(),
]);
export type CustomFieldValue = z.infer<typeof storedCustomFieldValueSchema>;

/** Value accepted on write (app + MCP): text is capped at `CUSTOM_FIELD_TEXT_MAX`. */
export const customFieldValueSchema = z.union([
	z.string().max(CUSTOM_FIELD_TEXT_MAX, `Text can be at most ${CUSTOM_FIELD_TEXT_MAX} characters`),
	z.number(),
	z.boolean(),
	z.null(),
]);

/** Keyed by Custom Field Definition id, so renaming a label never orphans a value. */
export const customFieldValuesSchema = z.record(z.string(), customFieldValueSchema);
export type CustomFieldValues = z.infer<typeof customFieldValuesSchema>;

/** Normal form for comparing labels: trimmed, case-insensitive. */
export const normalizeFieldLabel = (label: string) => label.trim().toLowerCase();

export const EMPTY_VALUE = "—";
export const DEFAULT_DATE_FORMAT = "dd MMM yyyy";

const isBlank = (value: unknown) =>
	value === undefined || value === null || (typeof value === "string" && !value.trim());

export function formatCustomFieldValue(
	def: Pick<CustomFieldDefinition, "type">,
	value: unknown,
	opts: { dateFormat?: string } = {}
): string {
	if (isBlank(value)) return EMPTY_VALUE;

	switch (def.type) {
		case CUSTOM_FIELD_TYPE.boolean:
			if (value === true) return "Yes";
			if (value === false) return "No";
			break;
		case CUSTOM_FIELD_TYPE.number:
			if (typeof value === "number" && Number.isFinite(value)) return value.toLocaleString();
			break;
		case CUSTOM_FIELD_TYPE.date: {
			const date = new Date(value as string | number);
			if (isValid(date)) return format(date, opts.dateFormat ?? DEFAULT_DATE_FORMAT);
			break;
		}
	}
	// Text, or a value whose shape does not match its type: show as stored.
	return String(value);
}

/** Pairs each definition (in order) with its value; values whose definition is gone are dropped. */
export const valuesForDefs = <D extends Pick<CustomFieldDefinition, "id">>(
	defs: D[],
	values: Record<string, unknown> | null | undefined
): Array<{ def: D; value: CustomFieldValue }> =>
	defs.map((def) => ({ def, value: (values?.[def.id] ?? null) as CustomFieldValue }));

/** Form → wire: drops unset and blank entries so a cleared field is removed from the blob. */
export const toCustomFieldValues = (
	values: Record<string, unknown> | null | undefined
): CustomFieldValues =>
	Object.fromEntries(
		Object.entries(values ?? {}).filter(
			(entry): entry is [string, CustomFieldValue] =>
				!isBlank(entry[1]) && storedCustomFieldValueSchema.safeParse(entry[1]).success
		)
	);

/**
 * Add-field form: label required, unique among `existing` (case-insensitive, trimmed) and the
 * org under `CUSTOM_FIELD_LIMIT`. Mirrors the server check so both errors show inline.
 */
export const addFieldFormSchema = (existing: Array<Pick<CustomFieldDefinition, "label">>) =>
	z.object({
		label: z
			.string()
			.trim()
			.min(1, "Label is required")
			.superRefine((label, ctx) => {
				const clash = existing.find(
					(d) => normalizeFieldLabel(d.label) === normalizeFieldLabel(label)
				);
				if (clash) {
					ctx.addIssue({
						code: "custom",
						message: `A field named "${clash.label}" already exists`,
					});
				} else if (existing.length >= CUSTOM_FIELD_LIMIT) {
					ctx.addIssue({
						code: "custom",
						message: `Limit of ${CUSTOM_FIELD_LIMIT} custom fields reached. Delete one to add another.`,
					});
				}
			}),
		type: customFieldTypeSchema,
	});
