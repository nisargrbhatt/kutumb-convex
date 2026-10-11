import type { CHANGE_REQUEST_KIND, CHANGE_REQUEST_STATUS } from "@/db/constants";
import type { RelationType } from "@/domain/relation";

export type ChangeRequestKind = (typeof CHANGE_REQUEST_KIND)[keyof typeof CHANGE_REQUEST_KIND];
export type ChangeRequestStatus =
	(typeof CHANGE_REQUEST_STATUS)[keyof typeof CHANGE_REQUEST_STATUS];

/**
 * Change Request payloads and stale rules. Pure (client-safe): the Reviews / My requests UI renders
 * these shapes; the seam and read fns judge staleness with `staleReason`.
 */

/** A profile / address / Custom Field value as stored (JSON-safe). */
export type FieldValue = string | number | boolean | null;

export type FieldChange = [before: FieldValue, after: FieldValue];

export type InfoField =
	| "firstName"
	| "middleName"
	| "lastName"
	| "nickName"
	| "gender"
	| "email"
	| "bloodGroup"
	| "mobileNumber"
	| "dateOfBirth"
	| "dateOfDeath";

export type AddressField = keyof AddressPayload;

/** Custom Field Values diff, keyed by definition id, label snapshot at submit. */
export type CustomFieldDiff = Record<string, { label: string | null; change: FieldChange }>;

/** `info`: changed fields only. Same shape as the `profile.updated` audit payload. */
export type InfoPayload = Partial<Record<InfoField, FieldChange>> & {
	customFieldData?: CustomFieldDiff;
};

/** `address_edit`: changed fields only (`targetId` = address). Same as `address.updated`. */
export type AddressEditPayload = Partial<Record<AddressField, FieldChange>>;

export type AddressPayload = {
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

/** `address_remove`: snapshot of the address (`targetId` = address). */
export type AddressRemovePayload = AddressPayload & { id: string };

/** `relation_add`: outgoing relation subject → `toId`. */
export type RelationAddPayload = {
	toId: string;
	toName: string;
	type: RelationType;
	note: string | null;
	bloodRelation: boolean;
};

/** `relation_remove`: snapshot of the outgoing relation (`targetId` = relation). */
export type RelationRemovePayload = {
	id: string;
	fromId: string;
	toId: string;
	toName: string | null;
	type: RelationType;
	note: string | null;
	bloodRelation: boolean;
};

export type ChangeRequestPayload = {
	create: null;
	info: InfoPayload;
	relation_add: RelationAddPayload;
	relation_remove: RelationRemovePayload;
	address_add: AddressPayload;
	address_edit: AddressEditPayload;
	address_remove: AddressRemovePayload;
};

/** A request row with `payload` typed by `kind` (narrow on `kind`). */
export type TypedPayload = {
	[K in ChangeRequestKind]: { kind: K; payload: ChangeRequestPayload[K] };
}[ChangeRequestKind];

/** Types a row's json `payload` by its `kind` (payload written by the seam per kind). */
export const withTypedPayload = <T extends { kind: ChangeRequestKind; payload: unknown }>(row: T) =>
	row as Omit<T, "kind" | "payload"> & TypedPayload;

/** Why approving is blocked (reject / withdraw stay allowed; never auto-closed). */
export type StaleReason =
	/** `info` / `address_edit`: these fields' current value ≠ the base the request was made on. */
	| { code: "fields_changed"; fields: string[] }
	/** Address / relation (or the profile itself) no longer exists. */
	| { code: "target_gone" }
	/** `relation_add`: counterpart is no longer `active`. */
	| { code: "counterpart_not_active" }
	/** `relation_add`: the pair is now related in either direction. */
	| { code: "already_related" };

export const staleReasonText = (r: StaleReason) => {
	switch (r.code) {
		case "fields_changed":
			return `Changed since requested: ${r.fields.join(", ")}`;
		case "target_gone":
			return "No longer exists";
		case "counterpart_not_active":
			return "The other profile is no longer active";
		case "already_related":
			return "These profiles are already related";
	}
};

/** Current state a request is judged against (only what its kind needs). */
export type StaleContext = {
	/** Subject profile row (info) — null when gone. */
	profile?: Record<string, unknown> & { customFieldData: Record<string, unknown> | null };
	/** Target address / relation row — null when gone. */
	target?: Record<string, unknown> | null;
	/** `relation_add`: counterpart status (null when gone) + whether the pair is related. */
	counterpartStatus?: string | null;
	pairRelated?: boolean;
};

/** Patched fields whose current value ≠ base (custom fields as `customFieldData.<id>`). */
function changedFields(diff: InfoPayload | AddressEditPayload, current: Record<string, unknown>) {
	const out: string[] = [];
	for (const [k, v] of Object.entries(diff)) {
		if (k === "customFieldData") {
			const cur = (current.customFieldData ?? {}) as Record<string, unknown>;
			for (const [id, { change }] of Object.entries(v as CustomFieldDiff)) {
				if ((cur[id] ?? null) !== (change[0] ?? null)) out.push(`customFieldData.${id}`);
			}
		} else if ((current[k] ?? null) !== ((v as FieldChange)[0] ?? null)) {
			out.push(k);
		}
	}
	return out;
}

/** The stale rule for one pending request, or null when approvable. */
export function staleReason(
	kind: ChangeRequestKind,
	payload: unknown,
	ctx: StaleContext
): StaleReason | null {
	switch (kind) {
		case "create":
		case "address_add":
			return null;
		case "info": {
			if (!ctx.profile) return { code: "target_gone" };
			const fields = changedFields(payload as InfoPayload, ctx.profile);
			return fields.length ? { code: "fields_changed", fields } : null;
		}
		case "address_edit": {
			if (!ctx.target) return { code: "target_gone" };
			const fields = changedFields(payload as AddressEditPayload, ctx.target);
			return fields.length ? { code: "fields_changed", fields } : null;
		}
		case "relation_remove":
		case "address_remove":
			return ctx.target ? null : { code: "target_gone" };
		case "relation_add":
			if (ctx.counterpartStatus !== "active") return { code: "counterpart_not_active" };
			return ctx.pairRelated ? { code: "already_related" } : null;
	}
}

/** What a pending request touches, for overlap warnings: same key on one profile = overlap. */
export function touchedKeys(kind: ChangeRequestKind, targetId: string | null, payload: unknown) {
	switch (kind) {
		case "create":
		case "address_add":
			return [];
		case "info":
			return Object.entries(payload as InfoPayload).flatMap(([k, v]) =>
				k === "customFieldData"
					? Object.keys(v as CustomFieldDiff).map((id) => `info:customFieldData.${id}`)
					: [`info:${k}`]
			);
		case "address_edit":
		case "address_remove":
			return [`address:${targetId}`];
		case "relation_remove":
			return [`relation:${targetId}`, `pair:${(payload as RelationRemovePayload).toId}`];
		case "relation_add":
			return [`pair:${(payload as RelationAddPayload).toId}`];
	}
}
