import type { BatchItem, BatchResponse } from "drizzle-orm/batch";
import { and, eq, or, sql } from "drizzle-orm";
import {
	auditEvent,
	changeRequest,
	communityAddress,
	communityProfile,
	communityRelation,
} from "@/db/app-schema";
import {
	CHANGE_REQUEST_KIND,
	CHANGE_REQUEST_STATUS,
	COMMUNITY_PROFILE_STATUS,
	type AuditAction,
} from "@/db/constants";
import type {
	AddressEditPayload,
	ChangeRequestKind,
	InfoPayload,
	RelationAddPayload,
	RelationRemovePayload,
} from "@/domain/changeRequest";
import { fullName, type CommunityProfileInput } from "@/domain/communityProfile";
import type { CustomFieldValues } from "@/domain/customFields";
import { AppError, type AppErrorKind } from "@/domain/errors";
import { can, type Actor } from "@/domain/permission";
import type { RelationType } from "@/domain/relation";
import { loadStaleReasons } from "@/domain/queries/changeRequests";
import type { QueryDb } from "@/domain/queries/db";

/** Drizzle client that can run an all-or-nothing `batch` (D1 client and `freshDb` both fit). */
export type BatchDb = QueryDb & {
	batch<U extends BatchItem<"sqlite">, T extends Readonly<[U, ...U[]]>>(
		batch: T
	): Promise<BatchResponse<T>>;
};

export type ProfileChangesDeps = {
	db: BatchDb;
	limits: { assertProfileSlot(organizationId: string, userId: string): Promise<void> };
	/** After a committed change to status, graph-visible fields or relations. */
	onGraphChanged: (organizationId: string) => void | Promise<void>;
	now?: () => Date;
	newId?: () => string;
};

export type AddressInput = {
	line1: string;
	line2: string | null;
	country: string;
	state: string;
	city: string;
	postalCode: string;
	type: "home" | "work" | "other" | null;
	note: string | null;
	digipin: string | null;
};

export type RelationInput = {
	toId: string;
	type: RelationType;
	note: string | null;
	bloodRelation: boolean;
};

/** One Change Request kind's worth of change. Caller never picks direct vs request. */
export type ProfileChange =
	/** `self`: the Actor's own linked profile; otherwise a Userless Profile. */
	| { kind: "create"; self?: boolean; profile: CommunityProfileInput }
	| { kind: "info"; profileId: string; expectedVersion: number; profile: CommunityProfileInput }
	| ({ kind: "relation_add"; profileId: string } & RelationInput)
	| { kind: "relation_remove"; profileId: string; relationId: string }
	| { kind: "address_add"; profileId: string; address: AddressInput }
	| {
			kind: "address_edit";
			profileId: string;
			addressId: string;
			expectedVersion: number;
			address: AddressInput;
	  }
	| { kind: "address_remove"; profileId: string; addressId: string };

export type SubmitResult =
	| { outcome: "applied"; profileId: string }
	| { outcome: "requested"; profileId: string; changeRequestId: string }
	| { outcome: "unchanged"; profileId: string };

export type ReviewDecision =
	| { decision: "approve"; note?: string | null }
	/** `note` = reject reason, required. */
	| { decision: "reject"; note: string };

type ProfileRow = typeof communityProfile.$inferSelect;
type RequestRow = typeof changeRequest.$inferSelect;
type AddressRow = typeof communityAddress.$inferSelect;
type RelationRow = typeof communityRelation.$inferSelect;

type EventDraft = {
	action: AuditAction;
	profileId: string;
	profileName: string;
	counterpartProfileId?: string | null;
	counterpartName?: string | null;
	targetId?: string | null;
	changeRequestId?: string | null;
	payload: unknown;
};

type Plan = {
	statements: BatchItem<"sqlite">[];
	events: EventDraft[];
	graphChanged: boolean;
	/** Domain error when an in-batch guard trips (a fn re-reads to classify it). */
	onGuardTrip: AppErrorKind | (() => Promise<AppErrorKind>);
};

const INFO_FIELDS = [
	"firstName",
	"middleName",
	"lastName",
	"nickName",
	"gender",
	"email",
	"bloodGroup",
	"mobileNumber",
	"dateOfBirth",
	"dateOfDeath",
] as const satisfies readonly (keyof CommunityProfileInput)[];

const ADDRESS_FIELDS = [
	"line1",
	"line2",
	"country",
	"state",
	"city",
	"postalCode",
	"type",
	"note",
	"digipin",
] as const satisfies readonly (keyof AddressInput)[];

/** `{ field: [before, after] }` for every field that differs. */
function diffFields<K extends string>(
	keys: readonly K[],
	before: Record<K, unknown>,
	after: Record<K, unknown>
) {
	const out: Record<string, [unknown, unknown]> = {};
	for (const k of keys) {
		const b = before[k] ?? null;
		const a = after[k] ?? null;
		if (b !== a) out[k] = [b, a];
	}
	return out;
}

const STALE_GUARD_MESSAGE = "malformed JSON";

/** True when `e` is the `json('stale')` guard firing (node:sqlite or D1 wording). */
const isGuardTrip = (e: unknown) => {
	const text = `${String(e)} ${String((e as { cause?: unknown } | null)?.cause ?? "")}`;
	return text.includes(STALE_GUARD_MESSAGE);
};

export function makeProfileChanges({
	db,
	limits,
	onGraphChanged,
	now = () => new Date(),
	newId = () => crypto.randomUUID(),
}: ProfileChangesDeps) {
	const isReviewer = (actor: Actor) => can(actor, { changeRequest: ["review"] });

	/**
	 * Errors the batch unless the previous DML touched exactly `n` rows. Param-less on purpose:
	 * raw `sql` with params inside `db.batch` breaks drizzle 0.45.2 on D1 (slice 08).
	 */
	const guard = (n = 1) => {
		if (!Number.isInteger(n) || n < 0) throw new Error(`bad guard count ${n}`);
		return db.all(sql.raw(`SELECT CASE WHEN changes() = ${n} THEN 1 ELSE json('stale') END`));
	};

	async function actorName(actor: Actor) {
		const u = await db.query.user.findFirst({
			where: (f, o) => o.eq(f.id, actor.userId),
			columns: { name: true },
		});
		return u?.name ?? "Unknown";
	}

	async function loadProfile(actor: Actor, profileId: string) {
		const row = await db.query.communityProfile.findFirst({
			where: (f, o) => o.and(o.eq(f.id, profileId), o.eq(f.organizationId, actor.organizationId)),
		});
		if (!row) throw new AppError("NotFound", "Community Profile not found");
		return row;
	}

	async function customFieldLabels(organizationId: string) {
		const defs = await db.query.communityProfileCustomField.findMany({
			where: (f, o) => o.eq(f.organizationId, organizationId),
			columns: { id: true, label: true },
		});
		return new Map(defs.map((d) => [d.id, d.label]));
	}

	/** Custom Field Values with a label snapshot: `{ [defId]: { label, value } }`. */
	const labelledValues = (values: CustomFieldValues | null, labels: Map<string, string>) =>
		Object.fromEntries(
			Object.entries(values ?? {}).map(([id, value]) => [
				id,
				{ label: labels.get(id) ?? null, value },
			])
		);

	const profileSnapshot = (row: ProfileRow, labels: Map<string, string>) => ({
		id: row.id,
		status: row.status,
		userId: row.userId,
		...Object.fromEntries(INFO_FIELDS.map((k) => [k, row[k] ?? null])),
		customFieldData: labelledValues(row.customFieldData, labels),
	});

	const addressSnapshot = (row: AddressRow) => ({
		id: row.id,
		...Object.fromEntries(ADDRESS_FIELDS.map((k) => [k, row[k] ?? null])),
	});

	const relationSnapshot = (row: RelationRow) => ({
		id: row.id,
		fromId: row.fromId,
		toId: row.toId,
		type: row.type,
		note: row.note,
		bloodRelation: row.bloodRelation ?? false,
	});

	async function isDraftCreator(actor: Actor, profileId: string) {
		const req = await db.query.changeRequest.findFirst({
			where: (f, o) =>
				o.and(
					o.eq(f.profileId, profileId),
					o.eq(f.kind, CHANGE_REQUEST_KIND.create),
					o.eq(f.status, CHANGE_REQUEST_STATUS.pending),
					o.eq(f.submitterUserId, actor.userId)
				),
			columns: { id: true },
		});
		return req !== undefined;
	}

	/**
	 * Who may change `subject`, and how: linked → its user, direct; Userless → owner/admin direct;
	 * own draft → its creator direct; `active` → a member's Change Request.
	 */
	async function route(actor: Actor, subject: ProfileRow): Promise<"direct" | "request"> {
		if (subject.userId) {
			if (subject.userId === actor.userId) return "direct";
			throw new AppError("Forbidden", "Only its linked user can change this profile");
		}
		if (isReviewer(actor)) return "direct";
		switch (subject.status) {
			case COMMUNITY_PROFILE_STATUS.draft:
				if (await isDraftCreator(actor, subject.id)) return "direct";
				throw new AppError("NotFound", "Community Profile not found");
			case COMMUNITY_PROFILE_STATUS.active:
				if (can(actor, { changeRequest: ["create"] })) return "request";
				throw new AppError("Forbidden", "You do not have permission to perform this action");
			default:
				throw new AppError("NotFound", "Community Profile not found");
		}
	}

	/**
	 * Turns a validated direct `plan` into a pending Change Request instead: its main event is the
	 * would-be change, so payload / target / counterpart come from it (statements are dropped).
	 */
	function planRequest(
		actor: Actor,
		name: string,
		subject: ProfileRow,
		change: Exclude<ProfileChange, { kind: "create" }>,
		applied: Plan
	) {
		const main = applied.events[0]!;
		let payload: unknown = main.payload;
		let targetId: string | null = null;
		switch (change.kind) {
			case "info":
				break;
			case "relation_add":
				payload = {
					toId: change.toId,
					toName: main.counterpartName ?? "",
					type: change.type,
					note: change.note,
					bloodRelation: change.bloodRelation,
				} satisfies RelationAddPayload;
				break;
			case "relation_remove":
				targetId = change.relationId;
				payload = {
					...(main.payload as Omit<RelationRemovePayload, "toName">),
					toName: main.counterpartName ?? null,
				} satisfies RelationRemovePayload;
				break;
			case "address_add":
				payload = change.address;
				break;
			case "address_edit":
				targetId = change.addressId;
				break;
			case "address_remove":
				targetId = change.addressId;
				break;
		}
		const changeRequestId = newId();
		const plan: Plan = {
			statements: [
				db.insert(changeRequest).values({
					id: changeRequestId,
					organizationId: actor.organizationId,
					profileId: subject.id,
					profileName: fullName(subject),
					kind: change.kind,
					status: CHANGE_REQUEST_STATUS.pending,
					targetId,
					payload,
					submitterUserId: actor.userId,
					submitterName: name,
					createdAt: now(),
				}),
			],
			events: [
				{
					action: "change_request.submitted",
					profileId: subject.id,
					profileName: fullName(subject),
					counterpartProfileId: main.counterpartProfileId ?? null,
					counterpartName: main.counterpartName ?? null,
					targetId,
					changeRequestId,
					payload: { kind: change.kind, payload },
				},
			],
			graphChanged: false,
			onGuardTrip: "Conflict",
		};
		return { plan, changeRequestId };
	}

	/** Statements + events closing every pending request of `profileId` as superseded. */
	async function supersedePending(actor: Actor, name: string, subject: ProfileRow) {
		const pending = await db.query.changeRequest.findMany({
			where: (f, o) =>
				o.and(
					o.eq(f.organizationId, actor.organizationId),
					o.eq(f.profileId, subject.id),
					o.eq(f.status, CHANGE_REQUEST_STATUS.pending)
				),
			columns: { id: true, kind: true },
		});
		const statements: BatchItem<"sqlite">[] = [
			db
				.update(changeRequest)
				.set({
					status: CHANGE_REQUEST_STATUS.superseded,
					resolvedByUserId: actor.userId,
					resolvedByName: name,
					resolvedAt: now(),
				})
				.where(
					and(
						eq(changeRequest.organizationId, actor.organizationId),
						eq(changeRequest.profileId, subject.id),
						eq(changeRequest.status, CHANGE_REQUEST_STATUS.pending)
					)
				),
			// A request submitted since the read would escape supersede: fail instead.
			guard(pending.length),
		];
		const events: EventDraft[] = pending.map((r) => ({
			action: "change_request.superseded",
			profileId: subject.id,
			profileName: fullName(subject),
			changeRequestId: r.id,
			payload: { kind: r.kind },
		}));
		return { statements, events };
	}

	async function commit(actor: Actor, name: string, plan: Plan) {
		const at = now();
		const eventInserts = plan.events.map((e) =>
			db.insert(auditEvent).values({
				id: newId(),
				organizationId: actor.organizationId,
				createdAt: at,
				actorUserId: actor.userId,
				actorName: name,
				actorRole: actor.role,
				counterpartProfileId: null,
				counterpartName: null,
				targetId: null,
				changeRequestId: null,
				...e,
			})
		);
		const items = [...plan.statements, ...eventInserts];
		if (items.length > 0) {
			try {
				await db.batch(items as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
			} catch (e) {
				if (isGuardTrip(e)) {
					const kind =
						typeof plan.onGuardTrip === "function" ? await plan.onGuardTrip() : plan.onGuardTrip;
					throw new AppError(
						kind,
						kind === "Stale"
							? "This record changed since you loaded it. Reload and try again."
							: "This record was changed by someone else. Reload and try again."
					);
				}
				throw e;
			}
		}
		if (plan.graphChanged) await onGraphChanged(actor.organizationId);
	}

	const emptyPlan = (): Plan => ({
		statements: [],
		events: [],
		graphChanged: false,
		onGuardTrip: "Conflict",
	});

	// ---- planners: change → statements + events (shared with Review approve later) ----

	async function planCreate(
		actor: Actor,
		name: string,
		change: Extract<ProfileChange, { kind: "create" }>
	) {
		const { organizationId, userId } = actor;
		if (change.self) {
			const existing = await db.query.communityProfile.findFirst({
				where: (f, o) => o.and(o.eq(f.organizationId, organizationId), o.eq(f.userId, userId)),
				columns: { id: true },
			});
			if (existing) throw new AppError("Conflict", "You already have a profile");
		}
		await limits.assertProfileSlot(organizationId, userId);

		const status =
			change.self || isReviewer(actor)
				? COMMUNITY_PROFILE_STATUS.active
				: COMMUNITY_PROFILE_STATUS.draft;
		const row: ProfileRow = {
			...change.profile,
			id: newId(),
			organizationId,
			userId: change.self ? userId : null,
			status,
			comment: change.self ? null : `Added by ${name}`,
			version: 0,
		};
		const plan = emptyPlan();
		plan.statements.push(db.insert(communityProfile).values(row));
		const snapshot = profileSnapshot(row, await customFieldLabels(organizationId));
		if (status === COMMUNITY_PROFILE_STATUS.active) {
			plan.events.push({
				action: "profile.created",
				profileId: row.id,
				profileName: fullName(row),
				payload: snapshot,
			});
			plan.graphChanged = true;
			return { plan, profileId: row.id, changeRequestId: null };
		}
		// Member-created draft: judged via its pending create Change Request (payload null).
		const changeRequestId = newId();
		plan.statements.push(
			db.insert(changeRequest).values({
				id: changeRequestId,
				organizationId,
				profileId: row.id,
				profileName: fullName(row),
				kind: CHANGE_REQUEST_KIND.create,
				status: CHANGE_REQUEST_STATUS.pending,
				payload: null,
				submitterUserId: userId,
				submitterName: name,
				createdAt: now(),
			})
		);
		plan.events.push({
			action: "change_request.submitted",
			profileId: row.id,
			profileName: fullName(row),
			changeRequestId,
			payload: { kind: CHANGE_REQUEST_KIND.create, profile: snapshot },
		});
		return { plan, profileId: row.id, changeRequestId };
	}

	function planInfo(
		subject: ProfileRow,
		change: Extract<ProfileChange, { kind: "info" }>,
		labels: Map<string, string>
	): Plan | null {
		if (subject.version !== change.expectedVersion) throw staleError();
		const diff: Record<string, unknown> = diffFields(INFO_FIELDS, subject, change.profile);
		const graphChanged =
			subject.status === COMMUNITY_PROFILE_STATUS.active && Object.keys(diff).length > 0;

		const before = subject.customFieldData ?? {};
		const after = change.profile.customFieldData ?? {};
		const custom: Record<string, { label: string | null; change: [unknown, unknown] }> = {};
		for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
			const b = before[id] ?? null;
			const a = after[id] ?? null;
			if (b !== a) custom[id] = { label: labels.get(id) ?? null, change: [b, a] };
		}
		if (Object.keys(custom).length > 0) diff.customFieldData = custom;
		if (Object.keys(diff).length === 0) return null;

		return {
			statements: [
				db
					.update(communityProfile)
					.set({ ...change.profile, version: sql`${communityProfile.version} + 1` })
					.where(
						and(
							eq(communityProfile.id, subject.id),
							eq(communityProfile.version, change.expectedVersion)
						)
					),
				guard(),
			],
			events: [
				{
					action: "profile.updated",
					profileId: subject.id,
					// Name at time of change: the new one if it changed.
					profileName: fullName({ ...subject, ...change.profile }),
					payload: diff,
				},
			],
			graphChanged,
			onGuardTrip: "Stale",
		};
	}

	async function planRelationAdd(
		actor: Actor,
		subject: ProfileRow,
		change: Extract<ProfileChange, { kind: "relation_add" }>
	): Promise<Plan> {
		if (change.toId === subject.id) {
			throw new AppError("Invalid", "A profile cannot have a relation to itself");
		}
		const target = await db.query.communityProfile.findFirst({
			where: (f, o) =>
				o.and(
					o.eq(f.id, change.toId),
					o.eq(f.organizationId, actor.organizationId),
					o.eq(f.status, COMMUNITY_PROFILE_STATUS.active)
				),
		});
		if (!target) throw new AppError("NotFound", "Target profile not found");
		const existing = await db.query.communityRelation.findFirst({
			where: (f, o) =>
				o.or(
					o.and(o.eq(f.fromId, subject.id), o.eq(f.toId, target.id)),
					o.and(o.eq(f.fromId, target.id), o.eq(f.toId, subject.id))
				),
			columns: { id: true },
		});
		if (existing) {
			throw new AppError("Invalid", "Relationship already exists between these profiles");
		}
		const row: RelationRow = {
			id: newId(),
			fromId: subject.id,
			toId: target.id,
			organizationId: actor.organizationId,
			type: change.type,
			note: change.note,
			bloodRelation: change.bloodRelation,
		};
		return {
			statements: [db.insert(communityRelation).values(row)],
			events: [
				{
					action: "relation.added",
					profileId: subject.id,
					profileName: fullName(subject),
					counterpartProfileId: target.id,
					counterpartName: fullName(target),
					targetId: row.id,
					payload: relationSnapshot(row),
				},
			],
			graphChanged: true,
			onGuardTrip: "Conflict",
		};
	}

	/** Statements + events removing `relations` (subject is either end). */
	async function relationRemovals(
		subject: ProfileRow,
		relations: RelationRow[],
		{ deleteRows }: { deleteRows: boolean }
	) {
		const counterpartIds = relations.map((r) => (r.fromId === subject.id ? r.toId : r.fromId));
		const counterparts =
			counterpartIds.length > 0
				? await db.query.communityProfile.findMany({
						where: (f, o) =>
							o.inArray(
								f.id,
								counterpartIds.filter((x): x is string => !!x)
							),
						columns: { id: true, firstName: true, middleName: true, lastName: true },
					})
				: [];
		const names = new Map(counterparts.map((c) => [c.id, fullName(c)]));
		const statements: BatchItem<"sqlite">[] = deleteRows
			? relations.flatMap((r) => [
					db.delete(communityRelation).where(eq(communityRelation.id, r.id)),
					guard(),
				])
			: [];
		const events: EventDraft[] = relations.map((r, i) => ({
			action: "relation.removed",
			profileId: subject.id,
			profileName: fullName(subject),
			counterpartProfileId: counterpartIds[i] ?? null,
			counterpartName: names.get(counterpartIds[i] ?? "") ?? null,
			targetId: r.id,
			payload: relationSnapshot(r),
		}));
		return { statements, events };
	}

	async function planRelationRemove(
		actor: Actor,
		subject: ProfileRow,
		change: Extract<ProfileChange, { kind: "relation_remove" }>
	): Promise<Plan> {
		// Outgoing only: incoming relations belong to the counterpart.
		const rel = await db.query.communityRelation.findFirst({
			where: (f, o) =>
				o.and(
					o.eq(f.id, change.relationId),
					o.eq(f.organizationId, actor.organizationId),
					o.eq(f.fromId, subject.id)
				),
		});
		if (!rel) throw new AppError("NotFound", "Relationship not found");
		return {
			...(await relationRemovals(subject, [rel], { deleteRows: true })),
			graphChanged: true,
			onGuardTrip: "Conflict",
		};
	}

	async function loadAddress(subject: ProfileRow, addressId: string) {
		const row = await db.query.communityAddress.findFirst({
			where: (f, o) => o.and(o.eq(f.id, addressId), o.eq(f.communityProfileId, subject.id)),
		});
		if (!row) throw new AppError("NotFound", "Address not found");
		return row;
	}

	function planAddressAdd(
		subject: ProfileRow,
		change: Extract<ProfileChange, { kind: "address_add" }>
	): Plan {
		const row: AddressRow = {
			...change.address,
			id: newId(),
			communityProfileId: subject.id,
			version: 0,
		};
		return {
			statements: [db.insert(communityAddress).values(row)],
			events: [
				{
					action: "address.added",
					profileId: subject.id,
					profileName: fullName(subject),
					targetId: row.id,
					payload: addressSnapshot(row),
				},
			],
			graphChanged: false,
			onGuardTrip: "Conflict",
		};
	}

	async function planAddressEdit(
		subject: ProfileRow,
		change: Extract<ProfileChange, { kind: "address_edit" }>
	): Promise<Plan | null> {
		const row = await loadAddress(subject, change.addressId);
		if (row.version !== change.expectedVersion) throw staleError();
		const diff = diffFields(ADDRESS_FIELDS, row, change.address);
		if (Object.keys(diff).length === 0) return null;
		return {
			statements: [
				db
					.update(communityAddress)
					.set({ ...change.address, version: sql`${communityAddress.version} + 1` })
					.where(
						and(
							eq(communityAddress.id, row.id),
							eq(communityAddress.version, change.expectedVersion)
						)
					),
				guard(),
			],
			events: [
				{
					action: "address.updated",
					profileId: subject.id,
					profileName: fullName(subject),
					targetId: row.id,
					payload: diff,
				},
			],
			graphChanged: false,
			onGuardTrip: "Stale",
		};
	}

	async function planAddressRemove(
		subject: ProfileRow,
		change: Extract<ProfileChange, { kind: "address_remove" }>
	): Promise<Plan> {
		const row = await loadAddress(subject, change.addressId);
		return {
			statements: [db.delete(communityAddress).where(eq(communityAddress.id, row.id)), guard()],
			events: [
				{
					action: "address.removed",
					profileId: subject.id,
					profileName: fullName(subject),
					targetId: row.id,
					payload: addressSnapshot(row),
				},
			],
			graphChanged: false,
			onGuardTrip: "Conflict",
		};
	}

	const staleError = () =>
		new AppError("Stale", "This record changed since you loaded it. Reload and try again.");

	function assertReviewer(actor: Actor) {
		if (!isReviewer(actor)) {
			throw new AppError("Forbidden", "You do not have permission to perform this action");
		}
	}

	/** Lifecycle status flip (`from` → `to`), superseding pending requests when deactivating. */
	async function setStatus(
		actor: Actor,
		profileId: string,
		from: ProfileRow["status"],
		to: ProfileRow["status"],
		action: AuditAction
	) {
		assertReviewer(actor);
		const subject = await loadProfile(actor, profileId);
		if (subject.status !== from) {
			throw new AppError("Invalid", `Only ${from} profiles can be changed to ${to}`);
		}
		const name = await actorName(actor);
		const supersede = await supersedePending(actor, name, subject);
		await commit(actor, name, {
			statements: [
				...supersede.statements,
				db
					.update(communityProfile)
					.set({ status: to, version: sql`${communityProfile.version} + 1` })
					.where(and(eq(communityProfile.id, subject.id), eq(communityProfile.status, from))),
				guard(),
			],
			events: [
				...supersede.events,
				{
					action,
					profileId: subject.id,
					profileName: fullName(subject),
					payload: { status: [from, to] },
				},
			],
			graphChanged: true,
			onGuardTrip: "Conflict",
		});
	}

	/** Hard delete: full snapshot + `relation.removed` per cascaded relation (no address events). */
	async function planDelete(actor: Actor, subject: ProfileRow): Promise<Plan> {
		const [addresses, relations, labels] = await Promise.all([
			db.query.communityAddress.findMany({
				where: (f, o) => o.eq(f.communityProfileId, subject.id),
			}),
			db
				.select()
				.from(communityRelation)
				.where(
					or(eq(communityRelation.fromId, subject.id), eq(communityRelation.toId, subject.id))
				),
			customFieldLabels(actor.organizationId),
		]);
		// Relations + addresses go by FK cascade; only events are written for them.
		const removals = await relationRemovals(subject, relations, { deleteRows: false });
		return {
			statements: [db.delete(communityProfile).where(eq(communityProfile.id, subject.id)), guard()],
			events: [
				{
					action: "profile.deleted",
					profileId: subject.id,
					profileName: fullName(subject),
					payload: {
						...profileSnapshot(subject, labels),
						addresses: addresses.map(addressSnapshot),
					},
				},
				...removals.events,
			],
			graphChanged: subject.status === COMMUNITY_PROFILE_STATUS.active,
			onGuardTrip: "Conflict",
		};
	}

	/** Pending request `id`; `submitterOnly` hides others' requests (NotFound). */
	async function loadPendingRequest(actor: Actor, id: string, { submitterOnly = false } = {}) {
		const row = await db.query.changeRequest.findFirst({
			where: (f, o) => o.and(o.eq(f.id, id), o.eq(f.organizationId, actor.organizationId)),
		});
		if (!row || (submitterOnly && row.submitterUserId !== actor.userId)) {
			throw new AppError("NotFound", "Change Request not found");
		}
		if (row.status !== CHANGE_REQUEST_STATUS.pending) {
			throw new AppError("Conflict", "This Change Request is already closed");
		}
		return row;
	}

	/** Closes `req` as `status`, guarded on it still being pending (else the batch → Conflict). */
	function closeRequest(
		actor: Actor,
		name: string,
		req: RequestRow,
		status: RequestRow["status"],
		note: string | null
	): BatchItem<"sqlite">[] {
		return [
			db
				.update(changeRequest)
				.set({
					status,
					resolvedByUserId: actor.userId,
					resolvedByName: name,
					resolvedAt: now(),
					resolutionNote: note,
				})
				.where(
					and(eq(changeRequest.id, req.id), eq(changeRequest.status, CHANGE_REQUEST_STATUS.pending))
				),
			guard(),
		];
	}

	/** Draft → active (create approved). */
	function planActivateDraft(subject: ProfileRow): Plan {
		return {
			statements: [
				db
					.update(communityProfile)
					.set({
						status: COMMUNITY_PROFILE_STATUS.active,
						version: sql`${communityProfile.version} + 1`,
					})
					.where(
						and(
							eq(communityProfile.id, subject.id),
							eq(communityProfile.status, COMMUNITY_PROFILE_STATUS.draft)
						)
					),
				guard(),
			],
			events: [
				{
					action: "profile.activated",
					profileId: subject.id,
					profileName: fullName(subject),
					payload: {
						status: [COMMUNITY_PROFILE_STATUS.draft, COMMUNITY_PROFILE_STATUS.active],
					},
				},
			],
			graphChanged: true,
			onGuardTrip: "Conflict",
		};
	}

	/** Stale reason of a pending request against current state (null = approvable). */
	async function staleOf(actor: Actor, req: RequestRow) {
		return (await loadStaleReasons(db, actor.organizationId, [req])).get(req.id) ?? null;
	}

	/**
	 * Approve of a non-create request: re-plans its payload onto current state through the same
	 * planners as a direct change (base checked first: stale → `Stale`).
	 */
	async function planApprove(actor: Actor, subject: ProfileRow, req: RequestRow): Promise<Plan> {
		if (await staleOf(actor, req)) throw staleError();
		const base = { profileId: subject.id };
		let plan: Plan | null;
		switch (req.kind as Exclude<ChangeRequestKind, "create">) {
			case "info": {
				const { customFieldData: custom, ...fields } = req.payload as InfoPayload;
				const profile = Object.fromEntries(
					INFO_FIELDS.map((k) => [k, k in fields ? fields[k]![1] : (subject[k] ?? null)])
				) as Omit<CommunityProfileInput, "customFieldData">;
				const cfv: CustomFieldValues = { ...subject.customFieldData };
				for (const [id, { change }] of Object.entries(custom ?? {})) {
					if (change[1] === null || change[1] === undefined) delete cfv[id];
					else cfv[id] = change[1] as CustomFieldValues[string];
				}
				plan = planInfo(
					subject,
					{
						...base,
						kind: "info",
						expectedVersion: subject.version,
						profile: { ...profile, customFieldData: Object.keys(cfv).length ? cfv : null },
					},
					await customFieldLabels(actor.organizationId)
				);
				break;
			}
			case "address_edit": {
				const row = await loadAddress(subject, req.targetId ?? "");
				const patch = req.payload as AddressEditPayload;
				const address = Object.fromEntries(
					ADDRESS_FIELDS.map((k) => [k, k in patch ? patch[k]![1] : (row[k] ?? null)])
				) as AddressInput;
				plan = await planAddressEdit(subject, {
					...base,
					kind: "address_edit",
					addressId: row.id,
					expectedVersion: row.version,
					address,
				});
				break;
			}
			case "address_add":
				plan = planAddressAdd(subject, {
					...base,
					kind: "address_add",
					address: req.payload as AddressInput,
				});
				break;
			case "address_remove":
				plan = await planAddressRemove(subject, {
					...base,
					kind: "address_remove",
					addressId: req.targetId ?? "",
				});
				break;
			case "relation_add": {
				const { toId, type, note, bloodRelation } = req.payload as RelationAddPayload;
				plan = await planRelationAdd(actor, subject, {
					...base,
					kind: "relation_add",
					toId,
					type,
					note,
					bloodRelation,
				});
				break;
			}
			case "relation_remove":
				plan = await planRelationRemove(actor, subject, {
					...base,
					kind: "relation_remove",
					relationId: req.targetId ?? "",
				});
				break;
		}
		return plan ?? emptyPlan();
	}

	return {
		/** Applies one change directly or files it as a pending Change Request (by routing). Routing by Actor role + profile linkage. */
		async submit(actor: Actor, change: ProfileChange): Promise<SubmitResult> {
			const name = await actorName(actor);
			if (change.kind === "create") {
				const { plan, profileId, changeRequestId } = await planCreate(actor, name, change);
				await commit(actor, name, plan);
				return changeRequestId
					? { outcome: "requested", profileId, changeRequestId }
					: { outcome: "applied", profileId };
			}

			const subject = await loadProfile(actor, change.profileId);
			const how = await route(actor, subject);

			let plan: Plan | null;
			switch (change.kind) {
				case "info":
					plan = planInfo(subject, change, await customFieldLabels(actor.organizationId));
					break;
				case "relation_add":
					plan = await planRelationAdd(actor, subject, change);
					break;
				case "relation_remove":
					plan = await planRelationRemove(actor, subject, change);
					break;
				case "address_add":
					plan = planAddressAdd(subject, change);
					break;
				case "address_edit":
					plan = await planAddressEdit(subject, change);
					break;
				case "address_remove":
					plan = await planAddressRemove(subject, change);
					break;
			}
			if (!plan) return { outcome: "unchanged", profileId: subject.id };
			if (how === "request") {
				const req = planRequest(actor, name, subject, change, plan);
				await commit(actor, name, req.plan);
				return {
					outcome: "requested",
					profileId: subject.id,
					changeRequestId: req.changeRequestId,
				};
			}
			await commit(actor, name, plan);
			return { outcome: "applied", profileId: subject.id };
		},

		/**
		 * Owner/admin closes a pending Change Request: approve applies it (blocked while `Stale`),
		 * reject discards it (always allowed). A guard trip re-reads: closed → `Conflict`, else
		 * stale → `Stale`, else `Conflict`.
		 */
		async review(actor: Actor, changeRequestId: string, decision: ReviewDecision) {
			assertReviewer(actor);
			const note = decision.note?.trim() || null;
			if (decision.decision === "reject" && !note) {
				throw new AppError("Invalid", "A reason is required to reject");
			}
			const req = await loadPendingRequest(actor, changeRequestId);
			const subject = await loadProfile(actor, req.profileId);
			const name = await actorName(actor);
			const approve = decision.decision === "approve";
			const isCreate = req.kind === CHANGE_REQUEST_KIND.create;
			const applied = isCreate
				? approve
					? planActivateDraft(subject)
					: await planDelete(actor, subject)
				: approve
					? await planApprove(actor, subject, req)
					: emptyPlan();
			await commit(actor, name, {
				statements: [
					...closeRequest(
						actor,
						name,
						req,
						approve ? CHANGE_REQUEST_STATUS.approved : CHANGE_REQUEST_STATUS.rejected,
						note
					),
					...applied.statements,
				],
				events: [
					{
						action: approve ? "change_request.approved" : "change_request.rejected",
						profileId: subject.id,
						profileName: fullName(subject),
						changeRequestId: req.id,
						payload: approve ? { kind: req.kind, note } : { kind: req.kind, reason: note },
					},
					...applied.events.map((e) => ({ ...e, changeRequestId: req.id })),
				],
				graphChanged: applied.graphChanged,
				onGuardTrip: async () => {
					const current = await db.query.changeRequest.findFirst({
						where: (f, o) => o.eq(f.id, req.id),
					});
					if (current?.status !== CHANGE_REQUEST_STATUS.pending) return "Conflict";
					return approve && !isCreate && (await staleOf(actor, current)) ? "Stale" : "Conflict";
				},
			});
			return { kind: req.kind, profileId: subject.id };
		},

		/** Submitter takes back a pending request; a withdrawn create deletes its draft. */
		async withdraw(actor: Actor, changeRequestId: string) {
			const req = await loadPendingRequest(actor, changeRequestId, { submitterOnly: true });
			const name = await actorName(actor);
			const subject = await loadProfile(actor, req.profileId);
			const applied =
				req.kind === CHANGE_REQUEST_KIND.create ? await planDelete(actor, subject) : emptyPlan();
			await commit(actor, name, {
				statements: [
					...closeRequest(actor, name, req, CHANGE_REQUEST_STATUS.withdrawn, null),
					...applied.statements,
				],
				events: [
					{
						action: "change_request.withdrawn",
						profileId: subject.id,
						profileName: fullName(subject),
						changeRequestId: req.id,
						payload: { kind: req.kind },
					},
					...applied.events.map((e) => ({ ...e, changeRequestId: req.id })),
				],
				graphChanged: applied.graphChanged,
				onGuardTrip: "Conflict",
			});
			return { kind: req.kind, profileId: subject.id };
		},

		/** Link an `active` Userless Profile to an Org Member of the same org. */
		async reassign(actor: Actor, profileId: string, targetUserId: string) {
			if (!can(actor, { communityProfile: ["reassign"] })) {
				throw new AppError("Forbidden", "You do not have permission to perform this action");
			}
			const subject = await loadProfile(actor, profileId);
			if (subject.userId) throw new AppError("Invalid", "Profile is already linked to a user");
			if (subject.status === COMMUNITY_PROFILE_STATUS.draft) {
				throw new AppError("Invalid", "This profile is a draft. Review it first.");
			}
			if (subject.status !== COMMUNITY_PROFILE_STATUS.active) {
				throw new AppError("Invalid", "Only active profiles can be assigned");
			}
			if (targetUserId === actor.userId) {
				throw new AppError("Invalid", "Can't assign a profile to yourself");
			}
			const target = await db.query.member.findFirst({
				where: (f, o) =>
					o.and(o.eq(f.organizationId, actor.organizationId), o.eq(f.userId, targetUserId)),
				with: { user: { columns: { id: true, name: true, email: true } } },
			});
			if (!target) throw new AppError("NotFound", "User is not a member of this organization");
			const taken = await db.query.communityProfile.findFirst({
				where: (f, o) =>
					o.and(o.eq(f.organizationId, actor.organizationId), o.eq(f.userId, targetUserId)),
				columns: { id: true },
			});
			if (taken) throw new AppError("Invalid", "This user already has a profile");

			const name = await actorName(actor);
			const supersede = await supersedePending(actor, name, subject);
			await commit(actor, name, {
				statements: [
					...supersede.statements,
					db
						.update(communityProfile)
						.set({ userId: targetUserId, version: sql`${communityProfile.version} + 1` })
						.where(
							and(
								eq(communityProfile.id, subject.id),
								sql`${communityProfile.userId} IS NULL`,
								eq(communityProfile.status, COMMUNITY_PROFILE_STATUS.active)
							)
						),
					guard(),
				],
				events: [
					...supersede.events,
					{
						action: "profile.reassigned",
						profileId: subject.id,
						profileName: fullName(subject),
						payload: {
							userId: target.user.id,
							name: target.user.name,
							email: target.user.email,
						},
					},
				],
				graphChanged: false,
				onGuardTrip: "Conflict",
			});
		},

		deactivate: (actor: Actor, profileId: string) =>
			setStatus(
				actor,
				profileId,
				COMMUNITY_PROFILE_STATUS.active,
				COMMUNITY_PROFILE_STATUS.inactive,
				"profile.deactivated"
			),

		/** No Member-limit check: an inactive profile already holds its slot. */
		reactivate: (actor: Actor, profileId: string) =>
			setStatus(
				actor,
				profileId,
				COMMUNITY_PROFILE_STATUS.inactive,
				COMMUNITY_PROFILE_STATUS.active,
				"profile.reactivated"
			),

		/** Owner-only hard delete: full snapshot + `relation.removed` per cascaded relation. */
		async remove(actor: Actor, profileId: string) {
			if (!can(actor, { communityProfile: ["delete"] })) {
				throw new AppError("Forbidden", "Only the owner can delete a profile");
			}
			const subject = await loadProfile(actor, profileId);
			const name = await actorName(actor);
			const supersede = await supersedePending(actor, name, subject);
			const deletion = await planDelete(actor, subject);
			await commit(actor, name, {
				...deletion,
				statements: [...supersede.statements, ...deletion.statements],
				events: [...supersede.events, ...deletion.events],
			});
		},
	};
}

export type ProfileChanges = ReturnType<typeof makeProfileChanges>;
