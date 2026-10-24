import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import type { SQL } from "drizzle-orm";
import { and, asc, count, eq, gt, like, or, sql } from "drizzle-orm";
import {
	CHANGE_REQUEST_KIND,
	CHANGE_REQUEST_STATUS,
	COMMUNITY_PROFILE_STATUS,
	ORGANIZATION_ROLES,
} from "@/db/constants";
import { changeRequest, communityProfile, communityRelation } from "@/db/app-schema";
import { storedIsoToDay } from "@/domain/calendarDay";
import { AppError } from "@/domain/errors";
import type { MemberFilter, SearchProfilesInput } from "@/domain/communityProfile";
import { fullName } from "@/domain/communityProfile";
import { listCustomFieldDefinitions } from "@/domain/customFieldDefinitions";
import type { Actor } from "@/domain/permission";
import type { QueryDb } from "./db";
import { matchedAddressesSql, resolveProfileFilter, type PlaceKey } from "./profileFilters";

export const SEARCH_DEFAULT_LIMIT = 25;
export const SEARCH_MAX_LIMIT = 100;

const crCol = (col: SQLiteColumn) => sql`cr.${sql.identifier(col.name)}`;

/**
 * The read-side visibility rule as a `communityProfile` condition (org scope included):
 * owner/admin see every profile; a plain member sees `active` profiles, drafts they created
 * (submitter of the pending `create` Change Request; backfilled drafts have none) and their own
 * linked profile whatever its status. Non-visible reads surface as `NotFound`.
 */
export function visibleProfileWhere(actor: Actor): SQL {
	const inOrg = eq(communityProfile.organizationId, actor.organizationId);
	if (actor.role !== ORGANIZATION_ROLES.member) return inOrg;

	const ownDraft = and(
		eq(communityProfile.status, COMMUNITY_PROFILE_STATUS.draft),
		// Columns named via `cr.` so drizzle's relational-query aliasing can't requalify them.
		sql`EXISTS (SELECT 1 FROM ${changeRequest} cr WHERE ${crCol(changeRequest.profileId)} = ${communityProfile.id}
			AND ${crCol(changeRequest.kind)} = ${CHANGE_REQUEST_KIND.create}
			AND ${crCol(changeRequest.status)} = ${CHANGE_REQUEST_STATUS.pending}
			AND ${crCol(changeRequest.submitterUserId)} = ${actor.userId})`
	);
	return and(
		inOrg,
		or(
			eq(communityProfile.status, COMMUNITY_PROFILE_STATUS.active),
			eq(communityProfile.userId, actor.userId),
			ownDraft
		)
	)!;
}

/** Members page: offset-paged list with the columns the table shows. */
export async function listCommunityMembers(db: QueryDb, actor: Actor, filter: MemberFilter) {
	const conditions = [visibleProfileWhere(actor)];

	if (filter.search.trim().length > 0) {
		const searchTerm = `%${filter.search.trim()}%`;
		conditions.push(
			sql`(${like(communityProfile.firstName, searchTerm)} OR ${like(communityProfile.lastName, searchTerm)} OR ${like(communityProfile.email, searchTerm)})`
		);
	}

	if (filter.status) {
		conditions.push(eq(communityProfile.status, filter.status));
	}

	if (filter.gender) {
		conditions.push(eq(communityProfile.gender, filter.gender));
	}

	const whereClause = and(...conditions);
	const offset = (filter.page - 1) * filter.pageSize;

	const [members, totalResult] = await Promise.all([
		db.query.communityProfile.findMany({
			where: () => whereClause!,
			limit: filter.pageSize,
			offset,
			columns: {
				id: true,
				firstName: true,
				middleName: true,
				lastName: true,
				nickName: true,
				gender: true,
				email: true,
				status: true,
				bloodGroup: true,
				mobileNumber: true,
				dateOfBirth: true,
			},
		}),
		db.select({ total: count() }).from(communityProfile).where(whereClause!),
	]);

	return {
		data: members,
		total: totalResult[0]?.total ?? 0,
		page: filter.page,
		pageSize: filter.pageSize,
	};
}

/**
 * Cursor-paged search for AI Clients: the shared profile filter (`resolveProfileFilter`) plus
 * paging, ordered by id so the cursor (last id) is a stable keyset. Items echo the filtered
 * fields only (besides id/name/gender/status): `bloodGroup`, `dateOfBirth` (born range),
 * `dateOfDeath` (living), `addresses` (matching addresses, filtered place parts only) and
 * `customFields` (filtered definitions, `{id,label,type,value}`).
 */
export async function searchProfiles(
	db: QueryDb,
	actor: Actor,
	input: Partial<SearchProfilesInput>
) {
	const limit = Math.min(
		Math.max(Math.trunc(input.limit ?? SEARCH_DEFAULT_LIMIT), 1),
		SEARCH_MAX_LIMIT
	);
	const { limit: _limit, cursor, ...filter } = input;
	const resolved = await resolveProfileFilter(db, actor, filter);
	const { places, customFields } = resolved;

	const echoBloodGroup = !!filter.bloodGroup?.length;
	const echoBirth = filter.bornOnOrAfter !== undefined || filter.bornOnOrBefore !== undefined;
	const echoDeath = filter.living !== undefined;

	const rows = await db
		.select({
			id: communityProfile.id,
			firstName: communityProfile.firstName,
			middleName: communityProfile.middleName,
			lastName: communityProfile.lastName,
			nickName: communityProfile.nickName,
			gender: communityProfile.gender,
			status: communityProfile.status,
			bloodGroup: communityProfile.bloodGroup,
			dateOfBirth: communityProfile.dateOfBirth,
			dateOfDeath: communityProfile.dateOfDeath,
			customFieldData: communityProfile.customFieldData,
			// Matching addresses as JSON, so one query serves the echo.
			matchedAddresses: resolved.placeWhere
				? matchedAddressesSql(resolved.placeWhere)
				: sql<string>`NULL`,
		})
		.from(communityProfile)
		.where(cursor ? and(resolved.where, gt(communityProfile.id, cursor)) : resolved.where)
		.orderBy(asc(communityProfile.id))
		.limit(limit + 1);

	const page = rows.slice(0, limit);
	return {
		items: page.map((r) => ({
			id: r.id,
			fullName: fullName(r),
			nickName: r.nickName,
			gender: r.gender,
			status: r.status,
			...(echoBloodGroup && { bloodGroup: r.bloodGroup }),
			...(echoBirth && { dateOfBirth: storedIsoToDay(r.dateOfBirth) }),
			...(echoDeath && { dateOfDeath: storedIsoToDay(r.dateOfDeath) }),
			...(places.length > 0 && { addresses: echoAddresses(r.matchedAddresses, places) }),
			...(customFields.length > 0 && {
				customFields: customFields.map((def) => {
					const value = r.customFieldData?.[def.id] ?? null;
					return {
						...def,
						value: def.type === "date" && typeof value === "string" ? storedIsoToDay(value) : value,
					};
				}),
			}),
		})),
		nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
	};
}

/** Distinct matching addresses reduced to the place parts that were filtered. */
function echoAddresses(json: string | null, places: PlaceKey[]) {
	const all = JSON.parse(json ?? "[]") as Record<PlaceKey, string>[];
	const seen = new Set<string>();
	return all.flatMap((address) => {
		const picked = Object.fromEntries(places.map((key) => [key, address[key]]));
		const key = JSON.stringify(picked);
		if (seen.has(key)) return [];
		seen.add(key);
		return [picked as Partial<Record<PlaceKey, string>>];
	});
}
const counterpartColumns = {
	id: true,
	firstName: true,
	middleName: true,
	lastName: true,
	nickName: true,
	gender: true,
	status: true,
} as const;

/**
 * Who is reading: `app` = the web app (role-aware visibility rule); `aiClient` = an MCP AI Client,
 * which sees `active` profiles only (plus the caller's own linked profile as subject) for every
 * role.
 */
export type ReadAudience = "app" | "aiClient";

function readRules(actor: Actor, audience: ReadAudience) {
	if (audience === "app") {
		const where = visibleProfileWhere(actor);
		return { subjectWhere: where, counterpartWhere: where };
	}
	const inOrgActive = and(
		eq(communityProfile.organizationId, actor.organizationId),
		eq(communityProfile.status, COMMUNITY_PROFILE_STATUS.active)
	)!;
	return {
		subjectWhere: and(
			eq(communityProfile.organizationId, actor.organizationId),
			or(
				eq(communityProfile.status, COMMUNITY_PROFILE_STATUS.active),
				eq(communityProfile.userId, actor.userId)
			)
		)!,
		counterpartWhere: inOrgActive,
	};
}

/**
 * One profile of the Actor's org with addresses, custom field definitions and relations.
 * Relations are subject-centric and never inverted (ADR 0001): `outgoing` = subject is `from`,
 * `incoming` = subject is `to`, `type` as stored.
 */
export async function getCommunityProfileDetail(
	db: QueryDb,
	actor: Actor,
	id: string,
	{ audience = "app" }: { audience?: ReadAudience } = {}
) {
	const { organizationId } = actor;
	const { subjectWhere, counterpartWhere } = readRules(actor, audience);

	const foundProfile = await db.query.communityProfile.findFirst({
		where: () => and(eq(communityProfile.id, id), subjectWhere)!,
		columns: {
			organizationId: false,
		},
	});

	if (!foundProfile) {
		throw new AppError("NotFound", "Community Profile not found");
	}

	// Independent of each other: one round of parallel reads.
	const [
		profileAddresses,
		customFieldDefs,
		outgoingRelations,
		incomingRelations,
		visibleOut,
		visibleIn,
	] = await Promise.all([
		db.query.communityAddress.findMany({
			where: (fields, ops) => ops.eq(fields.communityProfileId, foundProfile.id),
			columns: {
				communityProfileId: false,
			},
		}),
		listCustomFieldDefinitions(db, organizationId),
		// Outgoing: subject is the `from`. Type read subject-centric.
		db.query.communityRelation.findMany({
			where: (fields, ops) => ops.eq(fields.fromId, foundProfile.id),
			columns: { organizationId: false },
			with: {
				toCommunityProfile: { columns: counterpartColumns },
			},
		}),
		// Incoming: subject is the `to`. Type shown as stored (no inversion — ADR 0001).
		db.query.communityRelation.findMany({
			where: (fields, ops) => ops.eq(fields.toId, foundProfile.id),
			columns: { organizationId: false },
			with: {
				fromCommunityProfile: { columns: counterpartColumns },
			},
		}),
		relationsWithVisibleCounterpart(db, counterpartWhere, "out", foundProfile.id),
		relationsWithVisibleCounterpart(db, counterpartWhere, "in", foundProfile.id),
	]);

	return {
		profile: foundProfile,
		addresses: profileAddresses,
		customFieldDefs,
		outgoingRelations: outgoingRelations.filter((r) => visibleOut.has(r.id)),
		incomingRelations: incomingRelations.filter((r) => visibleIn.has(r.id)),
	};
}

/**
 * Ids of `subjectId`'s relations (`out`: subject is `from`, `in`: subject is `to`) whose
 * counterpart matches a visibility condition. Core query builder on purpose: relational queries
 * requalify every column to the root alias, which breaks the nested profile condition.
 */
export async function relationsWithVisibleCounterpart(
	db: QueryDb,
	visibleWhere: SQL,
	direction: "out" | "in",
	subjectId: string
) {
	const [subjectCol, counterpartCol] =
		direction === "out"
			? [communityRelation.fromId, communityRelation.toId]
			: [communityRelation.toId, communityRelation.fromId];
	const rows = await db
		.select({ id: communityRelation.id })
		.from(communityRelation)
		.innerJoin(communityProfile, eq(communityProfile.id, counterpartCol))
		.where(and(eq(subjectCol, subjectId), visibleWhere));
	return new Set(rows.map((r) => r.id));
}

const myCounterpartColumns = {
	id: true,
	firstName: true,
	middleName: true,
	lastName: true,
	nickName: true,
} as const;

async function findMyProfileId(db: QueryDb, { organizationId, userId }: Actor) {
	const profile = await db.query.communityProfile.findFirst({
		where: (fields, ops) =>
			ops.and(ops.eq(fields.organizationId, organizationId), ops.eq(fields.userId, userId)),
		columns: { id: true },
	});
	return profile?.id ?? null;
}

/** My relationships page: the Actor's own profile's relations, counterparts filtered by visibility. */
export async function getMyRelationships(db: QueryDb, actor: Actor) {
	const profileId = await findMyProfileId(db, actor);
	if (!profileId) return { profileId, outgoing: [], incoming: [] };

	const visibleWhere = visibleProfileWhere(actor);
	const [outgoing, incoming, visibleOut, visibleIn] = await Promise.all([
		db.query.communityRelation.findMany({
			where: (fields, ops) => ops.eq(fields.fromId, profileId),
			columns: { organizationId: false },
			with: { toCommunityProfile: { columns: myCounterpartColumns } },
		}),
		// Type shown as stored (no inversion — ADR 0001).
		db.query.communityRelation.findMany({
			where: (fields, ops) => ops.eq(fields.toId, profileId),
			columns: { organizationId: false },
			with: { fromCommunityProfile: { columns: myCounterpartColumns } },
		}),
		relationsWithVisibleCounterpart(db, visibleWhere, "out", profileId),
		relationsWithVisibleCounterpart(db, visibleWhere, "in", profileId),
	]);

	return {
		profileId,
		outgoing: outgoing.filter((r) => visibleOut.has(r.id)),
		incoming: incoming.filter((r) => visibleIn.has(r.id)),
	};
}

/** Dashboard: count of the Actor's own outgoing / incoming relations with a visible counterpart. */
export async function countMyRelations(db: QueryDb, actor: Actor, direction: "out" | "in") {
	const profileId = await findMyProfileId(db, actor);
	if (!profileId) return 0;
	return (
		await relationsWithVisibleCounterpart(db, visibleProfileWhere(actor), direction, profileId)
	).size;
}
