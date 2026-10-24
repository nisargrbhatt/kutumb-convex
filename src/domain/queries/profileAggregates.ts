import type { SQL } from "drizzle-orm";
import { and, count, eq, sql } from "drizzle-orm";
import { CUSTOM_FIELD_TYPE } from "@/db/constants";
import { communityAddress, communityProfile } from "@/db/app-schema";
import type { CountProfilesInput } from "@/domain/communityProfile";
import { listCustomFieldDefinitions } from "@/domain/customFieldDefinitions";
import { resolveFieldRef } from "@/domain/customFieldRefs";
import { AppError } from "@/domain/errors";
import type { Actor } from "@/domain/permission";
import type { QueryDb } from "./db";
import { customJson, resolveProfileFilter, type PlaceKey } from "./profileFilters";

/** At most this many groups are returned (the `null` bucket included); the rest are folded. */
export const COUNT_MAX_GROUPS = 50;

export type GroupValue = string | boolean | null;
export type CountGroup = { value: GroupValue; count: number };
export type CountProfilesResult = {
	total: number;
	/** Today as `YYYY-MM-DD`, so the model can turn ages into birth-day ranges. */
	asOf: string;
	groups?: CountGroup[];
	/** Number of groups folded away, and the profiles they hold. */
	otherGroups: number;
	otherCount: number;
	/** Present (true) only when a profile sits in several groups, so groups sum above `total`. */
	overlapping?: true;
};

/** A dimension's raw buckets: every non-null group, plus the profiles with no value. */
type Buckets = { groups: CountGroup[]; nullCount: number; overlapping?: boolean };

const dobDay = sql`substr(${communityProfile.dateOfBirth}, 1, 10)`;

/** Ordering for equal counts and for picking among equally common spellings. */
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** `GROUP BY` over `communityProfile` rows for a key expression; a null key is the null bucket. */
async function groupProfiles<K extends string | number>(
	db: QueryDb,
	where: SQL,
	key: SQL<K | null>,
	toValue: (key: K) => GroupValue
): Promise<Buckets> {
	const rows = await db
		.select({ k: key.as("k"), n: count() })
		.from(communityProfile)
		.where(where)
		.groupBy(sql`"k"`);
	return {
		groups: rows.filter((r) => r.k !== null).map((r) => ({ value: toValue(r.k!), count: r.n })),
		nullCount: rows.find((r) => r.k === null)?.n ?? 0,
	};
}

/** Most common original spelling per normalised key (ties: alphabetical). */
function pickSpellings(rows: { k: string; s: string; n: number }[]): Map<string, string> {
	const best = new Map<string, { s: string; n: number }>();
	for (const { k, s, n } of rows) {
		const cur = best.get(k);
		if (!cur || n > cur.n || (n === cur.n && byText(s, cur.s) < 0)) best.set(k, { s, n });
	}
	return new Map([...best].map(([k, v]) => [k, v.s]));
}

const withSpellings = (
	counts: { k: string | null; n: number }[],
	spellings: Map<string, string>
): Buckets => ({
	groups: counts
		.filter((r) => r.k !== null)
		.map((r) => ({ value: spellings.get(r.k!) ?? r.k!, count: r.n })),
	nullCount: counts.find((r) => r.k === null)?.n ?? 0,
});

/** Free text on the profile row (a text custom field), grouped on `lower(trim)`. */
async function groupProfileText(db: QueryDb, where: SQL, raw: SQL<string | null>) {
	const key = sql<string | null>`lower(trim(${raw}))`;
	const counts = await db
		.select({ k: key.as("k"), n: count() })
		.from(communityProfile)
		.where(where)
		.groupBy(sql`"k"`);
	const spelled = await db
		.select({ k: key.as("k"), s: sql<string>`trim(${raw})`.as("s"), n: count() })
		.from(communityProfile)
		.where(and(where, sql`${raw} IS NOT NULL`))
		.groupBy(sql`"k"`, sql`"s"`);
	return withSpellings(counts, pickSpellings(spelled as { k: string; s: string; n: number }[]));
}

/**
 * Place of the profile's addresses (city/state/country), grouped on `lower(trim)`. A profile counts
 * once per distinct place it has an address in, so groups may add up to more than the total.
 * Blank places are ignored; profiles with none land in the null bucket.
 */
async function groupPlaces(db: QueryDb, where: SQL, place: PlaceKey, total: number) {
	const raw = sql<string>`${communityAddress[place]}`;
	const key = sql<string>`lower(trim(${raw}))`;
	const present = sql`trim(${raw}) <> ''`;
	const joined = <T extends Record<string, unknown>>(fields: T) =>
		db
			.select(fields as never)
			.from(communityAddress)
			.innerJoin(communityProfile, eq(communityAddress.communityProfileId, communityProfile.id))
			.where(and(where, present));

	const counts = (await joined({
		k: key.as("k"),
		n: sql<number>`count(DISTINCT ${communityAddress.communityProfileId})`.as("n"),
	}).groupBy(sql`"k"`)) as unknown as { k: string; n: number }[];
	const spelled = (await joined({
		k: key.as("k"),
		s: sql<string>`trim(${raw})`.as("s"),
		n: sql<number>`count(*)`.as("n"),
	}).groupBy(sql`"k"`, sql`"s"`)) as unknown as { k: string; s: string; n: number }[];
	const [withPlace] = (await joined({
		n: sql<number>`count(DISTINCT ${communityAddress.communityProfileId})`.as("n"),
	})) as unknown as { n: number }[];

	const buckets = withSpellings(counts, pickSpellings(spelled));
	buckets.nullCount = total - (withPlace?.n ?? 0);
	buckets.overlapping = counts.reduce((sum, r) => sum + r.n, 0) > (withPlace?.n ?? 0);
	return buckets;
}

const CORE_VALUE_HINT =
	"Use one of: gender, bloodGroup, living, city, state, country, birthDecade.";

async function bucketsFor(
	db: QueryDb,
	actor: Actor,
	groupBy: NonNullable<CountProfilesInput["groupBy"]>,
	where: SQL,
	total: number
): Promise<Buckets> {
	if ("core" in groupBy) {
		switch (groupBy.core) {
			case "gender":
				return groupProfiles(db, where, sql<string | null>`${communityProfile.gender}`, (k) => k);
			case "bloodGroup":
				return groupProfiles(
					db,
					where,
					sql<string | null>`${communityProfile.bloodGroup}`,
					(k) => k
				);
			case "living":
				return groupProfiles(
					db,
					where,
					sql<number>`CASE WHEN ${communityProfile.dateOfDeath} IS NULL OR trim(${communityProfile.dateOfDeath}) = '' THEN 1 ELSE 0 END`,
					(k) => k === 1
				);
			case "birthDecade":
				// Calendar year of the stored DOB (UTC day, same edge conversion as the born-range filter).
				return groupProfiles(
					db,
					where,
					sql<
						string | null
					>`CASE WHEN ${dobDay} GLOB '[0-9][0-9][0-9][0-9]-*' THEN (CAST(substr(${dobDay}, 1, 4) AS INTEGER) / 10 * 10) || 's' ELSE NULL END`,
					(k) => k
				);
			case "city":
			case "state":
			case "country":
				return groupPlaces(db, where, groupBy.core, total);
		}
		throw new AppError("Invalid", `Unknown groupBy.core. ${CORE_VALUE_HINT}`);
	}

	const defs = await listCustomFieldDefinitions(db, actor.organizationId);
	const def = resolveFieldRef(defs, groupBy.field);
	const path = `$."${def.id}"`;
	const stored = sql`json_extract(${customJson}, ${path})`;
	const storedType = sql`json_type(${customJson}, ${path})`;
	switch (def.type) {
		case CUSTOM_FIELD_TYPE.text:
			return groupProfileText(
				db,
				where,
				sql<
					string | null
				>`CASE WHEN ${storedType} = 'text' AND trim(${stored}) <> '' THEN ${stored} ELSE NULL END`
			);
		case CUSTOM_FIELD_TYPE.boolean:
			return groupProfiles(
				db,
				where,
				sql<number>`CASE ${storedType} WHEN 'true' THEN 1 WHEN 'false' THEN 0 ELSE NULL END`,
				(k) => k === 1
			);
		default: {
			const ops =
				def.type === CUSTOM_FIELD_TYPE.number
					? "gt / gte / lt / lte / eq"
					: "before / after / eq (days as YYYY-MM-DD)";
			throw new AppError(
				"Invalid",
				`Cannot group by ${def.type} field "${def.label}" (id ${def.id}). Use customFieldFilters with ${ops} to count a range, or group by a text or boolean field.`
			);
		}
	}
}

/**
 * Live D1 count for AI Clients: profiles matching the shared filter (`active` only, whatever the
 * role), optionally split by one dimension. Groups run by count desc (ties alphabetical), at most
 * `COUNT_MAX_GROUPS` including the `null` bucket, which is always shown when non-empty; the rest
 * fold into `otherGroups` / `otherCount`. `now` is injectable for tests.
 */
export async function countProfiles(
	db: QueryDb,
	actor: Actor,
	input: Partial<CountProfilesInput>,
	now: Date = new Date()
): Promise<CountProfilesResult> {
	const { groupBy, ...filter } = input;
	const { where } = await resolveProfileFilter(db, actor, filter);
	const [{ total }] = await db.select({ total: count() }).from(communityProfile).where(where);
	const result: CountProfilesResult = {
		total,
		asOf: now.toISOString().slice(0, 10),
		otherGroups: 0,
		otherCount: 0,
	};
	if (!groupBy) return result;

	const buckets = await bucketsFor(db, actor, groupBy, where, total);
	const ranked = [...buckets.groups].sort(
		(a, b) => b.count - a.count || byText(String(a.value), String(b.value))
	);
	const room = COUNT_MAX_GROUPS - (buckets.nullCount > 0 ? 1 : 0);
	const kept = ranked.slice(0, room);
	const folded = ranked.slice(room);
	result.groups =
		buckets.nullCount > 0 ? [...kept, { value: null, count: buckets.nullCount }] : kept;
	result.otherGroups = folded.length;
	result.otherCount = folded.reduce((sum, g) => sum + g.count, 0);
	if (buckets.overlapping) result.overlapping = true;
	return result;
}
