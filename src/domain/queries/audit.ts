import type { SQL } from "drizzle-orm";
import { and, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { auditEvent } from "@/db/app-schema";
import type { AuditFilter, AuditPayload } from "@/domain/audit";
import type { Actor } from "@/domain/permission";
import { assertCan } from "@/domain/permission";
import type { QueryDb } from "./db";

export const AUDIT_PAGE_SIZE = 25;

/** Group key: events of one Change Request collapse; unlinked events stand alone. */
const groupKey = sql<string>`coalesce(${auditEvent.changeRequestId}, ${auditEvent.id})`;

/** Opaque cursor = last group's `(latestAt, key)`. */
const encodeCursor = (latestAt: number, key: string) => `${latestAt}:${key}`;
function decodeCursor(cursor: string) {
	const i = cursor.indexOf(":");
	const latestAt = Number(cursor.slice(0, i));
	if (i < 1 || !Number.isSafeInteger(latestAt)) return null;
	return { latestAt, key: cursor.slice(i + 1) };
}

/** Per-event conditions; `undefined` when the filter is empty. */
function eventMatches(filter: AuditFilter): SQL | undefined {
	const conds: (SQL | undefined)[] = [];
	if (filter.profileId)
		conds.push(
			or(
				eq(auditEvent.profileId, filter.profileId),
				eq(auditEvent.counterpartProfileId, filter.profileId)
			)
		);
	if (filter.actions?.length) conds.push(inArray(auditEvent.action, filter.actions));
	if (filter.actorUserId) conds.push(eq(auditEvent.actorUserId, filter.actorUserId));
	if (filter.from !== undefined) conds.push(gte(auditEvent.createdAt, new Date(filter.from)));
	if (filter.to !== undefined) conds.push(lte(auditEvent.createdAt, new Date(filter.to)));
	return conds.length ? and(...conds) : undefined;
}

/**
 * Org Audit log / profile History, paged by group (spec § Audit pagination): group key
 * `coalesce(changeRequestId, id)`, ordered by the group's latest event `(latestAt, key)` desc,
 * 25 groups per page, every event of each group returned. A filter matches a group when any one
 * of its events satisfies it. Owner/admin only (`auditEvent.read`).
 */
export async function listAuditGroups(db: QueryDb, actor: Actor, filter: AuditFilter) {
	assertCan(actor, { auditEvent: ["read"] });
	const inOrg = eq(auditEvent.organizationId, actor.organizationId);
	const matches = eventMatches(filter);
	const latestAt = sql<number>`max(${auditEvent.createdAt})`;
	const after = filter.cursor ? decodeCursor(filter.cursor) : null;

	const page = await db
		.select({ key: groupKey, latestAt })
		.from(auditEvent)
		.where(
			matches
				? and(
						inOrg,
						inArray(
							groupKey,
							db.select({ key: groupKey }).from(auditEvent).where(and(inOrg, matches))
						)
					)
				: inOrg
		)
		.groupBy(groupKey)
		.having(
			after
				? sql`(${latestAt} < ${after.latestAt} OR (${latestAt} = ${after.latestAt} AND ${groupKey} < ${after.key}))`
				: undefined
		)
		.orderBy(desc(latestAt), desc(groupKey))
		.limit(AUDIT_PAGE_SIZE + 1);

	const groups = page.slice(0, AUDIT_PAGE_SIZE);
	const keys = groups.map((g) => g.key);
	const events = keys.length
		? await db
				.select()
				.from(auditEvent)
				.where(and(inOrg, inArray(groupKey, keys)))
				.orderBy(desc(auditEvent.createdAt), desc(auditEvent.id))
		: [];

	const last = groups.at(-1);
	return {
		groups: keys.map((key) => ({
			key,
			events: events
				.filter((e) => (e.changeRequestId ?? e.id) === key)
				.map((e) => ({ ...e, payload: e.payload as AuditPayload })),
		})),
		nextCursor:
			page.length > AUDIT_PAGE_SIZE && last ? encodeCursor(last.latestAt, last.key) : null,
	};
}

/** Cap on facet options; beyond it the filter still works via the History tab. */
const FACET_LIMIT = 1000;

/**
 * Audit log filter options from the log itself, so departed Actors and deleted profiles stay
 * selectable: distinct Actors and subject profiles, each with its latest name snapshot, A→Z.
 * (SQLite bare-column-with-max: the name comes from the latest row of each group.)
 */
export async function listAuditFacets(db: QueryDb, actor: Actor) {
	assertCan(actor, { auditEvent: ["read"] });
	const inOrg = eq(auditEvent.organizationId, actor.organizationId);
	const [actors, profiles] = await Promise.all([
		db
			.select({
				id: auditEvent.actorUserId,
				name: auditEvent.actorName,
				at: sql`max(${auditEvent.createdAt})`,
			})
			.from(auditEvent)
			.where(inOrg)
			.groupBy(auditEvent.actorUserId)
			.limit(FACET_LIMIT),
		db
			.select({
				id: auditEvent.profileId,
				name: auditEvent.profileName,
				at: sql`max(${auditEvent.createdAt})`,
			})
			.from(auditEvent)
			.where(inOrg)
			.groupBy(auditEvent.profileId)
			.limit(FACET_LIMIT),
	]);
	const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
	return {
		actors: actors.map(({ id, name }) => ({ id, name })).sort(byName),
		profiles: profiles.map(({ id, name }) => ({ id, name })).sort(byName),
	};
}

export type AuditGroupPage = Awaited<ReturnType<typeof listAuditGroups>>;
export type AuditEventRow = AuditGroupPage["groups"][number]["events"][number];
