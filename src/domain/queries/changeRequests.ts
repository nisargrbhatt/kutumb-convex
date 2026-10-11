import { and, asc, count, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import {
	changeRequest,
	communityAddress,
	communityProfile,
	communityRelation,
} from "@/db/app-schema";
import { CHANGE_REQUEST_STATUS } from "@/db/constants";
import {
	staleReason,
	touchedKeys,
	withTypedPayload,
	type ChangeRequestKind,
	type RelationAddPayload,
	type StaleReason,
} from "@/domain/changeRequest";
import { fullName } from "@/domain/communityProfile";
import { assertCan, can, type Actor } from "@/domain/permission";
import type { QueryDb } from "./db";

type StaleInput = {
	id: string;
	kind: ChangeRequestKind;
	profileId: string;
	targetId: string | null;
	payload: unknown;
};

const unique = (xs: (string | null | undefined)[]) => [
	...new Set(xs.filter((x): x is string => !!x)),
];

/**
 * Current-state stale check for many requests at once (few queries, not one per request).
 * Returns request id → reason (null = approvable).
 */
export async function loadStaleReasons(
	db: QueryDb,
	organizationId: string,
	requests: StaleInput[]
): Promise<Map<string, StaleReason | null>> {
	const of = (k: ChangeRequestKind) => requests.filter((r) => r.kind === k);
	const infoIds = unique(of("info").map((r) => r.profileId));
	const addressIds = unique(
		[...of("address_edit"), ...of("address_remove")].map((r) => r.targetId)
	);
	const relationIds = unique(of("relation_remove").map((r) => r.targetId));
	const adds = of("relation_add");
	const counterpartIds = unique(adds.map((r) => (r.payload as RelationAddPayload).toId));
	const addSubjects = unique(adds.map((r) => r.profileId));

	const none = Promise.resolve([]);
	const [profiles, addresses, relations, counterparts, pairs] = await Promise.all([
		infoIds.length
			? db
					.select()
					.from(communityProfile)
					.where(
						and(
							eq(communityProfile.organizationId, organizationId),
							inArray(communityProfile.id, infoIds)
						)
					)
			: none,
		addressIds.length
			? db.select().from(communityAddress).where(inArray(communityAddress.id, addressIds))
			: none,
		relationIds.length
			? db
					.select()
					.from(communityRelation)
					.where(
						and(
							eq(communityRelation.organizationId, organizationId),
							inArray(communityRelation.id, relationIds)
						)
					)
			: none,
		counterpartIds.length
			? db
					.select({ id: communityProfile.id, status: communityProfile.status })
					.from(communityProfile)
					.where(
						and(
							eq(communityProfile.organizationId, organizationId),
							inArray(communityProfile.id, counterpartIds)
						)
					)
			: none,
		adds.length
			? db
					.select({ fromId: communityRelation.fromId, toId: communityRelation.toId })
					.from(communityRelation)
					.where(
						or(
							and(
								inArray(communityRelation.fromId, addSubjects),
								inArray(communityRelation.toId, counterpartIds)
							),
							and(
								inArray(communityRelation.fromId, counterpartIds),
								inArray(communityRelation.toId, addSubjects)
							)
						)
					)
			: none,
	]);

	const profileById = new Map(profiles.map((p) => [p.id, p]));
	const addressById = new Map(addresses.map((a) => [a.id, a]));
	const relationById = new Map(relations.map((r) => [r.id, r]));
	const statusById = new Map(counterparts.map((c) => [c.id, c.status]));
	const related = new Set(pairs.flatMap((p) => [`${p.fromId}>${p.toId}`, `${p.toId}>${p.fromId}`]));

	return new Map(
		requests.map((r) => {
			const toId = r.kind === "relation_add" ? (r.payload as RelationAddPayload).toId : null;
			// Address rows carry no org id: only count one that still belongs to the subject.
			const address = r.targetId ? addressById.get(r.targetId) : undefined;
			const target =
				r.kind === "relation_remove"
					? (relationById.get(r.targetId ?? "") ?? null)
					: address && address.communityProfileId === r.profileId
						? address
						: null;
			return [
				r.id,
				staleReason(r.kind, r.payload, {
					profile: profileById.get(r.profileId),
					target,
					counterpartStatus: toId ? (statusById.get(toId) ?? null) : null,
					pairRelated: toId ? related.has(`${r.profileId}>${toId}`) : false,
				}),
			];
		})
	);
}

const requestColumns = {
	id: changeRequest.id,
	profileId: changeRequest.profileId,
	profileName: changeRequest.profileName,
	kind: changeRequest.kind,
	status: changeRequest.status,
	targetId: changeRequest.targetId,
	payload: changeRequest.payload,
	submitterUserId: changeRequest.submitterUserId,
	submitterName: changeRequest.submitterName,
	createdAt: changeRequest.createdAt,
};

/**
 * Reviews queue (owner/admin): pending requests grouped by profile, oldest group first, requests
 * oldest first. Each request carries its stale reason and the ids of other pending requests on
 * the same profile touching the same field / address / relation / pair (`overlapsWith`).
 */
export async function listPendingByProfile(db: QueryDb, actor: Actor) {
	assertCan(actor, { changeRequest: ["review"] });
	const rows = await db
		.select({
			...requestColumns,
			currentFirstName: communityProfile.firstName,
			currentMiddleName: communityProfile.middleName,
			currentLastName: communityProfile.lastName,
			profileStatus: communityProfile.status,
		})
		.from(changeRequest)
		.leftJoin(communityProfile, eq(communityProfile.id, changeRequest.profileId))
		.where(
			and(
				eq(changeRequest.organizationId, actor.organizationId),
				eq(changeRequest.status, CHANGE_REQUEST_STATUS.pending)
			)
		)
		.orderBy(asc(changeRequest.createdAt), asc(changeRequest.id));
	const stale = await loadStaleReasons(db, actor.organizationId, rows);

	const groups = new Map<string, typeof rows>();
	for (const r of rows) groups.set(r.profileId, [...(groups.get(r.profileId) ?? []), r]);

	return [...groups.values()].map((reqs) => {
		const first = reqs[0]!;
		const keys = new Map(
			reqs.map((r) => [r.id, new Set(touchedKeys(r.kind, r.targetId, r.payload))])
		);
		const requests = reqs.map((r) =>
			withTypedPayload({
				id: r.id,
				kind: r.kind,
				targetId: r.targetId,
				payload: r.payload,
				submitterUserId: r.submitterUserId,
				submitterName: r.submitterName,
				createdAt: r.createdAt,
				stale: stale.get(r.id) ?? null,
				overlapsWith: reqs
					.filter((o) => o.id !== r.id && [...keys.get(o.id)!].some((k) => keys.get(r.id)!.has(k)))
					.map((o) => o.id),
			})
		);
		return {
			profileId: first.profileId,
			profileName:
				first.currentFirstName !== null && first.currentLastName !== null
					? fullName({
							firstName: first.currentFirstName,
							middleName: first.currentMiddleName,
							lastName: first.currentLastName,
						})
					: first.profileName,
			/** null when the profile no longer exists. */
			profileStatus: first.profileStatus,
			oldestAt: first.createdAt,
			count: requests.length,
			staleCount: requests.filter((r) => r.stale).length,
			kinds: [...new Set(requests.map((r) => r.kind))],
			requests,
		};
	});
}

export type ReviewQueueGroup = Awaited<ReturnType<typeof listPendingByProfile>>[number];

/** Nav badge (owner/admin): pending requests in the org. */
export async function pendingCount(db: QueryDb, actor: Actor) {
	assertCan(actor, { changeRequest: ["review"] });
	const [row] = await db
		.select({ total: count() })
		.from(changeRequest)
		.where(
			and(
				eq(changeRequest.organizationId, actor.organizationId),
				eq(changeRequest.status, CHANGE_REQUEST_STATUS.pending)
			)
		);
	return row?.total ?? 0;
}

/** My requests: the Actor's own requests (any status), newest first; stale reason when pending. */
export async function listMyRequests(db: QueryDb, actor: Actor) {
	const rows = await db
		.select({
			...requestColumns,
			resolvedByName: changeRequest.resolvedByName,
			resolvedAt: changeRequest.resolvedAt,
			resolutionNote: changeRequest.resolutionNote,
			submitterSeenAt: changeRequest.submitterSeenAt,
		})
		.from(changeRequest)
		.where(
			and(
				eq(changeRequest.organizationId, actor.organizationId),
				eq(changeRequest.submitterUserId, actor.userId)
			)
		)
		.orderBy(desc(changeRequest.createdAt), desc(changeRequest.id));
	const stale = await loadStaleReasons(
		db,
		actor.organizationId,
		rows.filter((r) => r.status === CHANGE_REQUEST_STATUS.pending)
	);
	return rows.map((r) => withTypedPayload({ ...r, stale: stale.get(r.id) ?? null }));
}

export type MyRequest = Awaited<ReturnType<typeof listMyRequests>>[number];

/** Resolved by someone else (not withdrawn) and not yet seen by the submitter. */
const unseenWhere = (actor: Actor) =>
	and(
		eq(changeRequest.organizationId, actor.organizationId),
		eq(changeRequest.submitterUserId, actor.userId),
		ne(changeRequest.status, CHANGE_REQUEST_STATUS.pending),
		ne(changeRequest.status, CHANGE_REQUEST_STATUS.withdrawn),
		isNull(changeRequest.submitterSeenAt)
	);

/** My requests badge. */
export async function unseenCount(db: QueryDb, actor: Actor) {
	const [row] = await db.select({ total: count() }).from(changeRequest).where(unseenWhere(actor));
	return row?.total ?? 0;
}

/** Visiting My requests: stamps `submitterSeenAt` on the Actor's unseen resolved requests. */
export async function markRequestsSeen(db: QueryDb, actor: Actor, at: Date) {
	await db.update(changeRequest).set({ submitterSeenAt: at }).where(unseenWhere(actor));
}

/**
 * Pending banner on profile detail: owner/admin see every pending request on the profile,
 * anyone else only their own (never others' requests).
 */
export async function pendingForProfile(db: QueryDb, actor: Actor, profileId: string) {
	const all = can(actor, { changeRequest: ["review"] });
	const [row] = await db
		.select({ total: count() })
		.from(changeRequest)
		.where(
			and(
				eq(changeRequest.organizationId, actor.organizationId),
				eq(changeRequest.profileId, profileId),
				eq(changeRequest.status, CHANGE_REQUEST_STATUS.pending),
				all ? undefined : eq(changeRequest.submitterUserId, actor.userId)
			)
		);
	return { scope: all ? ("all" as const) : ("mine" as const), count: row?.total ?? 0 };
}
