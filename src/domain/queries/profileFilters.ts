import type { SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { and, eq, inArray, sql } from "drizzle-orm";
import { COMMUNITY_PROFILE_STATUS, CUSTOM_FIELD_TYPE } from "@/db/constants";
import { communityAddress, communityProfile } from "@/db/app-schema";
import { dayToStoredIso } from "@/domain/calendarDay";
import {
	MAX_CUSTOM_FIELD_FILTERS,
	type CustomFieldFilter,
	type ProfileFilter,
} from "@/domain/communityProfile";
import { resolveFieldRef } from "@/domain/customFieldRefs";
import { listCustomFieldDefinitions } from "@/domain/customFieldDefinitions";
import type { CustomFieldDefinition, CustomFieldType } from "@/domain/customFields";
import { AppError } from "@/domain/errors";
import type { Actor } from "@/domain/permission";
import type { QueryDb } from "./db";

/** Custom-field blob as JSON text (the column is a BLOB in prod, TEXT in some seeds). */
export const customJson = sql`CAST(${communityProfile.customFieldData} AS TEXT)`;

/**
 * D1 predicate builder for the shared AI Client profile filter (`profileFilterSchema`), used by
 * `search_profiles` and `count_profiles`. Scope is always the Actor's org and `active` profiles,
 * whatever the role; every filter key is ANDed on top. Bad input raises `Invalid` with a hint.
 */

export const PLACE_KEYS = ["city", "state", "country"] as const;
export type PlaceKey = (typeof PLACE_KEYS)[number];

/** Alias of `communityAddress` inside the EXISTS / echo subqueries. */
const ADDR = "a";
const PROFILE_ID = sql.raw(`"communityProfile"."id"`);

export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

const OPS_BY_TYPE: Record<CustomFieldType, readonly CustomFieldFilter["op"][]> = {
	[CUSTOM_FIELD_TYPE.text]: ["eq", "contains", "isSet", "isNotSet"],
	[CUSTOM_FIELD_TYPE.number]: ["eq", "gt", "gte", "lt", "lte", "isSet", "isNotSet"],
	[CUSTOM_FIELD_TYPE.date]: ["eq", "before", "after", "isSet", "isNotSet"],
	[CUSTOM_FIELD_TYPE.boolean]: ["eq", "isSet", "isNotSet"],
};

const VALUE_HINT: Record<CustomFieldType, string> = {
	[CUSTOM_FIELD_TYPE.text]: 'a string, e.g. "Kashyap"',
	[CUSTOM_FIELD_TYPE.number]: "a JSON number, e.g. 180",
	[CUSTOM_FIELD_TYPE.date]: 'a day string, e.g. "2010-06-15" (YYYY-MM-DD)',
	[CUSTOM_FIELD_TYPE.boolean]: "true or false",
};

function requireDay(name: string, value: string): string {
	if (!dayToStoredIso(value)) {
		throw new AppError(
			"Invalid",
			`${name} must be a real calendar day in YYYY-MM-DD format, e.g. "1990-05-17"; got "${value}".`
		);
	}
	return value;
}

/** SQL for one custom field condition against the stored `customFieldData` JSON. */
function customFieldCondition(def: CustomFieldDefinition, filter: CustomFieldFilter): SQL {
	const { op, value } = filter;
	const allowed = OPS_BY_TYPE[def.type];
	const where = `field "${def.label}" (id ${def.id}, ${def.type})`;
	if (!allowed.includes(op)) {
		throw new AppError(
			"Invalid",
			`Operator "${op}" does not apply to ${def.type} ${where}. Use one of: ${allowed.join(", ")}.`
		);
	}

	const path = `$."${def.id}"`;
	const stored = sql`json_extract(${customJson}, ${path})`;
	const storedType = sql`json_type(${customJson}, ${path})`;

	if (op === "isSet" || op === "isNotSet") {
		// Set = a non-null JSON value that is not a blank string.
		const isSet = sql`(coalesce(${storedType}, 'null') <> 'null' AND NOT (${storedType} = 'text' AND trim(${stored}) = ''))`;
		return op === "isSet" ? isSet : sql`NOT ${isSet}`;
	}

	const valueError = () =>
		new AppError(
			"Invalid",
			`Operator "${op}" on ${def.type} ${where} needs "value" as ${VALUE_HINT[def.type]}.`
		);

	switch (def.type) {
		case CUSTOM_FIELD_TYPE.text: {
			if (typeof value !== "string") throw valueError();
			if (op === "eq") return sql`lower(trim(${stored})) = lower(trim(${value}))`;
			return sql`lower(${stored}) LIKE lower(${`%${escapeLike(value.trim())}%`}) ESCAPE '\\'`;
		}
		case CUSTOM_FIELD_TYPE.number: {
			if (typeof value !== "number" || !Number.isFinite(value)) throw valueError();
			const cmp = { eq: "=", gt: ">", gte: ">=", lt: "<", lte: "<=" }[op as "eq"]!;
			return sql`(${storedType} IN ('integer', 'real') AND ${stored} ${sql.raw(cmp)} ${value})`;
		}
		case CUSTOM_FIELD_TYPE.date: {
			if (typeof value !== "string" || !dayToStoredIso(value)) throw valueError();
			const cmp = { eq: "=", before: "<", after: ">" }[op as "eq"]!;
			// Calendar day of the stored ISO timestamp = its first 10 chars (UTC day).
			return sql`(${storedType} = 'text' AND substr(${stored}, 1, 10) ${sql.raw(cmp)} ${value})`;
		}
		case CUSTOM_FIELD_TYPE.boolean: {
			if (typeof value !== "boolean") throw valueError();
			return sql`${storedType} = ${value ? "true" : "false"}`;
		}
	}
}

/** Place filters as conditions on the aliased `communityAddress` row (one address must match all). */
function placeConditions(filter: ProfileFilter): SQL[] {
	return PLACE_KEYS.flatMap((key) => {
		const wanted = filter[key]?.trim();
		if (!wanted) return [];
		return [sql`lower(trim(${sql.raw(ADDR)}.${sql.identifier(key)})) = lower(trim(${wanted}))`];
	});
}

export type ResolvedProfileFilter = {
	/** Org + `active` + every filter key, ANDed. Condition on `communityProfile`. */
	where: SQL;
	/** The place conditions on the aliased address row (`undefined` when no place filter). */
	placeWhere: SQL | undefined;
	/** Place keys that were filtered, in `PLACE_KEYS` order. */
	places: PlaceKey[];
	/** Definitions behind `customFieldFilters`, deduped, in first-use order. */
	customFields: CustomFieldDefinition[];
};

/**
 * Select-list expression: JSON array of `{city,state,country}` for the profile's addresses that
 * satisfy `placeWhere`. Single-table selects drop table prefixes from drizzle columns, so the
 * outer id is spelled out.
 */
export const matchedAddressesSql = (placeWhere: SQL) =>
	sql<string>`(SELECT json_group_array(json_object('city', ${sql.raw(ADDR)}.city, 'state', ${sql.raw(ADDR)}.state, 'country', ${sql.raw(ADDR)}.country)) FROM ${communityAddress} ${sql.raw(ADDR)} WHERE ${sql.raw(ADDR)}.communityProfileId = ${PROFILE_ID} AND ${placeWhere})`;

function assertCustomFieldFilterCount(filter: ProfileFilter) {
	const count = filter.customFieldFilters?.length ?? 0;
	if (count > MAX_CUSTOM_FIELD_FILTERS) {
		throw new AppError(
			"Invalid",
			`At most ${MAX_CUSTOM_FIELD_FILTERS} customFieldFilters are allowed, got ${count}. Drop some, or narrow with core filters first.`
		);
	}
}

/**
 * Pure predicate builder. `defs` are the org's current Custom Field Definitions (only read when
 * `customFieldFilters` is non-empty). Throws `Invalid` for >5 custom field filters, unknown or
 * ambiguous fields, an op that does not fit the field type, a mistyped value or a bad day.
 */
export function buildProfileFilter(
	actor: Actor,
	filter: ProfileFilter,
	defs: CustomFieldDefinition[]
): ResolvedProfileFilter {
	const conditions: SQL[] = [
		eq(communityProfile.organizationId, actor.organizationId),
		// AI Clients see `active` only, whatever the caller's role.
		eq(communityProfile.status, COMMUNITY_PROFILE_STATUS.active),
	];

	for (const token of filter.query?.trim().split(/\s+/).filter(Boolean) ?? []) {
		const term = `%${escapeLike(token)}%`;
		const match = (col: SQLiteColumn) => sql`${col} LIKE ${term} ESCAPE '\\'`;
		conditions.push(
			sql`(${match(communityProfile.firstName)} OR ${match(communityProfile.middleName)} OR ${match(communityProfile.lastName)} OR ${match(communityProfile.nickName)})`
		);
	}
	if (filter.gender) conditions.push(eq(communityProfile.gender, filter.gender));
	if (filter.bloodGroup?.length) {
		conditions.push(inArray(communityProfile.bloodGroup, [...new Set(filter.bloodGroup)]));
	}

	// Calendar day of the stored ISO DOB = its first 10 chars (UTC day); undated never match.
	const dob = sql`substr(${communityProfile.dateOfBirth}, 1, 10)`;
	if (filter.bornOnOrAfter !== undefined) {
		conditions.push(sql`${dob} >= ${requireDay("bornOnOrAfter", filter.bornOnOrAfter)}`);
	}
	if (filter.bornOnOrBefore !== undefined) {
		conditions.push(sql`${dob} <= ${requireDay("bornOnOrBefore", filter.bornOnOrBefore)}`);
	}

	if (filter.living !== undefined) {
		const alive = sql`(${communityProfile.dateOfDeath} IS NULL OR trim(${communityProfile.dateOfDeath}) = '')`;
		conditions.push(filter.living ? alive : sql`NOT ${alive}`);
	}

	const places = PLACE_KEYS.filter((key) => filter[key]?.trim());
	const placeParts = placeConditions(filter);
	const placeWhere = placeParts.length ? and(...placeParts) : undefined;
	if (placeWhere) {
		// One address must satisfy every given place key (so city+state means "Springfield, Illinois").
		conditions.push(
			sql`EXISTS (SELECT 1 FROM ${communityAddress} ${sql.raw(ADDR)} WHERE ${sql.raw(ADDR)}.${sql.identifier("communityProfileId")} = ${PROFILE_ID} AND ${placeWhere})`
		);
	}

	assertCustomFieldFilterCount(filter);
	const customFilters = filter.customFieldFilters ?? [];
	const customFields: CustomFieldDefinition[] = [];
	for (const customFilter of customFilters) {
		const def = resolveFieldRef(defs, customFilter.field);
		conditions.push(customFieldCondition(def, customFilter));
		if (!customFields.some((d) => d.id === def.id)) customFields.push(def);
	}

	return { where: and(...conditions)!, placeWhere, places, customFields };
}

/** `buildProfileFilter` with the org's definitions loaded at call time (only when needed). */
export async function resolveProfileFilter(
	db: QueryDb,
	actor: Actor,
	filter: ProfileFilter
): Promise<ResolvedProfileFilter> {
	assertCustomFieldFilterCount(filter);
	const needsDefs = (filter.customFieldFilters?.length ?? 0) > 0;
	const defs = needsDefs ? await listCustomFieldDefinitions(db, actor.organizationId) : [];
	return buildProfileFilter(actor, filter, defs);
}
