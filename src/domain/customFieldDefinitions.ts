import { sql } from "drizzle-orm";
import { communityProfileCustomField } from "@/db/app-schema";
import { AppError } from "./errors";
import { CUSTOM_FIELD_LIMIT, LimitError, type OnLimitReached } from "./limits";
import {
	normalizeFieldLabel,
	type CustomFieldDefinition,
	type CustomFieldType,
} from "./customFields";
import type { QueryDb } from "./queries/db";

/**
 * An org's Custom Field Definitions in definition order (insertion order: the table has no
 * ordering column, so `rowid` is the stable key).
 */
export async function listCustomFieldDefinitions(
	db: QueryDb,
	organizationId: string
): Promise<CustomFieldDefinition[]> {
	return db.query.communityProfileCustomField.findMany({
		where: (fields, ops) => ops.eq(fields.organizationId, organizationId),
		columns: { id: true, label: true, type: true },
		orderBy: () => sql`rowid`,
	});
}

/**
 * Adds a definition. Label must be unique within the org (case-insensitive, trimmed) and the org
 * may hold at most `CUSTOM_FIELD_LIMIT`. Enforced on add only: legacy duplicates stay as they are.
 * Check-then-insert, so two concurrent adds can overshoot by one (same trade-off as the other limits).
 */
export async function addCustomFieldDefinition(
	db: QueryDb,
	organizationId: string,
	input: { label: string; type: CustomFieldType },
	deps: { newId: () => string; onLimitReached?: OnLimitReached }
): Promise<{ id: string }> {
	const label = input.label.trim();
	const existing = await listCustomFieldDefinitions(db, organizationId);

	const clash = existing.find((d) => normalizeFieldLabel(d.label) === normalizeFieldLabel(label));
	if (clash) {
		throw new AppError("Invalid", `A custom field named "${clash.label}" already exists`);
	}
	if (existing.length >= CUSTOM_FIELD_LIMIT) {
		deps.onLimitReached?.({ limit: "customField", organizationId });
		throw new LimitError("customField");
	}

	const id = deps.newId();
	await db
		.insert(communityProfileCustomField)
		.values({ id, organizationId, label, type: input.type });
	return { id };
}
