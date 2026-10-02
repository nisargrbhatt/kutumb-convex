import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { and, asc, count, eq, gt, like, sql } from "drizzle-orm";
import { COMMUNITY_PROFILE_STATUS } from "@/db/constants";
import { communityProfile } from "@/db/app-schema";
import { AppError } from "@/domain/errors";
import type { MemberFilter, SearchProfilesInput } from "@/domain/communityProfile";
import { fullName } from "@/domain/communityProfile";
import type { CustomFieldDefinition } from "@/domain/customFields";
import type { Actor } from "@/domain/permission";
import type { QueryDb } from "./db";

export const SEARCH_DEFAULT_LIMIT = 25;
export const SEARCH_MAX_LIMIT = 100;

/** Members page: offset-paged list with the columns the table shows. */
export async function listCommunityMembers(db: QueryDb, actor: Actor, filter: MemberFilter) {
	const conditions = [eq(communityProfile.organizationId, actor.organizationId)];

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
		eq(communityProfile.status, input.status ?? COMMUNITY_PROFILE_STATUS.active),
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
 * One profile of the Actor's org with addresses, custom field definitions and relations.
 * Relations are subject-centric and never inverted (ADR 0001): `outgoing` = subject is `from`,
 * `incoming` = subject is `to`, `type` as stored.
 */
export async function getCommunityProfileDetail(db: QueryDb, actor: Actor, id: string) {
	const { organizationId } = actor;

	const foundProfile = await db.query.communityProfile.findFirst({
		where: (fields, ops) =>
			ops.and(ops.eq(fields.id, id), ops.eq(fields.organizationId, organizationId)),
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

	return {
		profile: foundProfile,
		addresses: profileAddresses,
		customFieldDefs: customFieldDefs satisfies CustomFieldDefinition[],
		outgoingRelations,
		incomingRelations,
	};
}
