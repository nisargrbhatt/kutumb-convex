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
import { AppError } from "@/domain/errors";
import type { MemberFilter, SearchProfilesInput } from "@/domain/communityProfile";
import { fullName } from "@/domain/communityProfile";
import type { CustomFieldDefinition } from "@/domain/customFields";
import type { Actor } from "@/domain/permission";
import type { QueryDb } from "./db";

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

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Cursor-paged search for AI Clients. Every whitespace-separated token must match one of the name
 * parts (so "jared smith" works), ordered by id so the cursor (last id) is a stable keyset.
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

	const conditions = [
		eq(communityProfile.organizationId, actor.organizationId),
		// AI Clients see `active` only, whatever the caller's role.
		eq(communityProfile.status, COMMUNITY_PROFILE_STATUS.active),
	];
	if (input.gender) conditions.push(eq(communityProfile.gender, input.gender));
	if (input.cursor) conditions.push(gt(communityProfile.id, input.cursor));

	for (const token of input.query?.trim().split(/\s+/).filter(Boolean) ?? []) {
		const term = `%${escapeLike(token)}%`;
		const match = (col: SQLiteColumn) => sql`${col} LIKE ${term} ESCAPE '\\'`;
		conditions.push(
			sql`(${match(communityProfile.firstName)} OR ${match(communityProfile.middleName)} OR ${match(communityProfile.lastName)} OR ${match(communityProfile.nickName)})`
		);
	}

	const rows = await db.query.communityProfile.findMany({
		where: () => and(...conditions)!,
		orderBy: () => [asc(communityProfile.id)],
		limit: limit + 1,
		columns: {
			id: true,
			firstName: true,
			middleName: true,
			lastName: true,
			nickName: true,
			gender: true,
			status: true,
		},
	});

	const page = rows.slice(0, limit);
	return {
		items: page.map((r) => ({
			id: r.id,
			fullName: fullName(r),
			nickName: r.nickName,
			gender: r.gender,
			status: r.status,
		})),
		nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
	};
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

	const profileAddresses = await db.query.communityAddress.findMany({
		where: (fields, ops) => ops.eq(fields.communityProfileId, foundProfile.id),
		columns: {
			communityProfileId: false,
		},
	});

	const customFieldDefs = await db.query.communityProfileCustomField.findMany({
		where: (fields, ops) => ops.eq(fields.organizationId, organizationId),
		columns: { id: true, label: true, type: true },
	});

	// Outgoing: subject is the `from`. Type read subject-centric.
	const outgoingRelations = await db.query.communityRelation.findMany({
		where: (fields, ops) => ops.eq(fields.fromId, foundProfile.id),
		columns: { organizationId: false },
		with: {
			toCommunityProfile: { columns: counterpartColumns },
		},
	});

	// Incoming: subject is the `to`. Type shown as stored (no inversion — ADR 0001).
	const incomingRelations = await db.query.communityRelation.findMany({
		where: (fields, ops) => ops.eq(fields.toId, foundProfile.id),
		columns: { organizationId: false },
		with: {
			fromCommunityProfile: { columns: counterpartColumns },
		},
	});

	const [visibleOut, visibleIn] = await Promise.all([
		relationsWithVisibleCounterpart(db, counterpartWhere, "out", foundProfile.id),
		relationsWithVisibleCounterpart(db, counterpartWhere, "in", foundProfile.id),
	]);

	return {
		profile: foundProfile,
		addresses: profileAddresses,
		customFieldDefs: customFieldDefs satisfies CustomFieldDefinition[],
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
