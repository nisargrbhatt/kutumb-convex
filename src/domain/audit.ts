import { z } from "zod";
import { AUDIT_ACTION } from "@/db/constants";
import type { AuditAction } from "@/db/constants";

/**
 * Audit read filter (wire + query). A group matches when any one of its events satisfies every
 * given condition. `from` / `to`: epoch ms, inclusive. `profileId`: subject or counterpart.
 */
export const auditFilterSchema = z.object({
	cursor: z.string().max(200).optional(),
	profileId: z.string().min(1).optional(),
	actions: z.array(z.enum(AUDIT_ACTION)).min(1).optional(),
	actorUserId: z.string().min(1).optional(),
	from: z.number().int().nonnegative().optional(),
	to: z.number().int().nonnegative().optional(),
});

export type AuditFilter = z.infer<typeof auditFilterSchema>;

/** Audit Event `payload`: stored JSON (shape per action, see taxonomy). */
export type AuditPayload =
	| string
	| number
	| boolean
	| null
	| AuditPayload[]
	| { [key: string]: AuditPayload };

/** The slice of an Audit Event the History presentation needs. */
export type AuditEventView = {
	action: AuditAction;
	actorRole: string;
	profileName: string;
	counterpartName: string | null;
	payload: unknown;
};

/** "How" badge of a group. */
export type AuditHow =
	| "pending"
	| "approved"
	| "rejected"
	| "withdrawn"
	| "superseded"
	| "direct"
	| "self-edit";

const isRequestEvent = (e: AuditEventView) => e.action.startsWith("change_request.");

/**
 * Change Request group → latest request outcome (`submitted` alone = pending). Unlinked event →
 * `direct` for owner/admin, `self-edit` for a member (own linked profile or own draft).
 * `events`: newest first.
 */
export function groupHow(events: AuditEventView[]): AuditHow {
	const latest = events.find(isRequestEvent);
	if (latest) {
		const outcome = latest.action.slice("change_request.".length);
		return outcome === "submitted" ? "pending" : (outcome as AuditHow);
	}
	return events[0]?.actorRole === "member" ? "self-edit" : "direct";
}

const humanize = (key: string) => {
	const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ");
	return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v);
const isPair = (v: unknown): v is [unknown, unknown] => Array.isArray(v) && v.length === 2;

/** Payload keys that are references, not displayable values. */
const HIDDEN_KEYS = new Set(["id", "userId", "fromId", "toId", "kind"]);

export type DiffRow =
	| { label: string; before: unknown; after: unknown }
	| { label: string; value: unknown };

/**
 * Payload → display rows. `*.updated` / lifecycle `{ field: [before, after] }` → change rows;
 * snapshots → value rows (ids and empty values skipped). Custom Field Values use their label
 * snapshot.
 */
export function diffRows(payload: unknown): DiffRow[] {
	if (!isRecord(payload)) return [];
	const rows: DiffRow[] = [];
	for (const [key, v] of Object.entries(payload)) {
		if (HIDDEN_KEYS.has(key)) continue;
		if (key === "customFieldData" && isRecord(v)) {
			for (const [defId, cf] of Object.entries(v)) {
				if (!isRecord(cf)) continue;
				const label = typeof cf.label === "string" ? cf.label : defId;
				if (isPair(cf.change)) rows.push({ label, before: cf.change[0], after: cf.change[1] });
				else if (cf.value !== null && cf.value !== undefined && cf.value !== "")
					rows.push({ label, value: cf.value });
			}
			continue;
		}
		if (isPair(v)) rows.push({ label: humanize(key), before: v[0], after: v[1] });
		else if (v !== null && v !== undefined && v !== "")
			rows.push({ label: humanize(key), value: v });
	}
	return rows;
}

/** Display string for a diff value. */
export function formatAuditValue(v: unknown): string {
	if (v === null || v === undefined || v === "") return "—";
	if (typeof v === "boolean") return v ? "Yes" : "No";
	if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? "" : "s"}`;
	if (typeof v === "object") return JSON.stringify(v);
	return String(v);
}

const ACTION_VERB: Record<AuditAction, (p: string, c: string | null) => string> = {
	"profile.created": (p) => `Created ${p}`,
	"profile.updated": (p) => `Updated ${p}`,
	"profile.activated": (p) => `Activated ${p}`,
	"profile.deactivated": (p) => `Deactivated ${p}`,
	"profile.reactivated": (p) => `Reactivated ${p}`,
	"profile.reassigned": (p) => `Reassigned ${p}`,
	"profile.deleted": (p) => `Deleted ${p}`,
	"relation.added": (p, c) => `Added relation ${p} → ${c ?? "?"}`,
	"relation.removed": (p, c) => `Removed relation ${p} → ${c ?? "?"}`,
	"address.added": (p) => `Added address to ${p}`,
	"address.updated": (p) => `Updated address of ${p}`,
	"address.removed": (p) => `Removed address from ${p}`,
	"change_request.submitted": (p) => `Request for ${p}`,
	"change_request.approved": (p) => `Request for ${p}`,
	"change_request.rejected": (p) => `Request for ${p}`,
	"change_request.withdrawn": (p) => `Request for ${p}`,
	"change_request.superseded": (p) => `Request for ${p}`,
};

/** Short action label for an event row. */
export const auditActionLabel = (action: AuditAction) => humanize(action.replace(".", " "));

/**
 * One sentence for a group: its applied change if any (with changed field labels for
 * `*.updated`), else the request (`Requested <kind> for <profile>`). `events`: newest first.
 */
export function groupSummary(events: AuditEventView[]): string {
	const applied = events.find((e) => !isRequestEvent(e));
	if (applied) {
		const base = ACTION_VERB[applied.action](applied.profileName, applied.counterpartName);
		if (applied.action !== "profile.updated" && applied.action !== "address.updated") return base;
		const fields = diffRows(applied.payload).map((r) => r.label);
		return fields.length ? `${base}: ${fields.join(", ")}` : base;
	}
	const req = events[0];
	if (!req) return "";
	const kind =
		events
			.map((e) => (isRecord(e.payload) ? e.payload.kind : undefined))
			.find((k): k is string => typeof k === "string") ?? null;
	return kind
		? `Requested ${kind.replace(/_/g, " ")} for ${req.profileName}`
		: ACTION_VERB[req.action](req.profileName, req.counterpartName);
}
