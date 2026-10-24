import { z } from "zod";
import { customFieldTypeSchema } from "@/domain/customFields";
import { listCustomFieldDefinitions } from "@/domain/customFieldDefinitions";
import type { Actor } from "@/domain/permission";
import type { QueryDb } from "@/domain/queries/db";

export const customFieldDefinitionOutput = z.object({
	id: z.string(),
	label: z.string(),
	type: customFieldTypeSchema,
});

export const listCustomFieldsOutput = z.object({
	customFields: z
		.array(customFieldDefinitionOutput)
		.describe("This community's custom fields, in definition order."),
});

export const listCustomFieldsDescription = `Lists the community's custom fields: [{id, label, type}] where type is text, number, date or boolean.

Use a field's id (or its exact label) wherever a tool takes a custom field. get_profile returns every field with its value, null when unset. The same list is in whoami.customFields; call either one first. Fields can be added or removed while you work, so re-list if a field you used is reported unknown.`;

export async function listCustomFields(
	db: QueryDb,
	actor: Actor
): Promise<z.input<typeof listCustomFieldsOutput>> {
	return { customFields: await listCustomFieldDefinitions(db, actor.organizationId) };
}
