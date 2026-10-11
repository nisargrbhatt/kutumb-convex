import type { ChangeRequestKind, TypedPayload } from "@/domain/changeRequest";
import { type DiffRow, diffRows } from "@/domain/audit";
import { formatRelationType } from "@/domain/relation";

/**
 * Change Request → display rows for review (Reviews drawer, My requests). Pure, client-safe.
 * `tone`: `change` = before → after rows; `add` / `remove` = snapshot of what is added / removed;
 * `none` = nothing to diff (`create`: the draft profile itself is judged).
 */
export type RequestDiff = { tone: "change" | "add" | "remove" | "none"; rows: DiffRow[] };

const KIND_LABEL: Record<ChangeRequestKind, string> = {
	create: "New profile",
	info: "Info edit",
	relation_add: "Add relation",
	relation_remove: "Remove relation",
	address_add: "Add address",
	address_edit: "Edit address",
	address_remove: "Remove address",
};

export const requestKindLabel = (kind: ChangeRequestKind) => KIND_LABEL[kind];

function relationRows(p: {
	toName: string | null;
	type: string;
	bloodRelation: boolean;
	note: string | null;
}): DiffRow[] {
	const rows: DiffRow[] = [
		{ label: "Relative", value: p.toName },
		{ label: "Relation", value: formatRelationType(p.type) },
		{ label: "Blood relation", value: p.bloodRelation },
	];
	if (p.note) rows.push({ label: "Note", value: p.note });
	return rows;
}

/** Address keys `diffRows` can't humanize well. */
const ADDRESS_LABEL: Record<string, string> = {
	Line1: "Line 1",
	Line2: "Line 2",
	Digipin: "DIGIPIN",
};
const addressRows = (payload: unknown) =>
	diffRows(payload).map((r) => ({ ...r, label: ADDRESS_LABEL[r.label] ?? r.label }));

export function requestDiff(r: TypedPayload): RequestDiff {
	switch (r.kind) {
		case "create":
			return { tone: "none", rows: [] };
		case "info":
			return { tone: "change", rows: diffRows(r.payload) };
		case "address_edit":
			return { tone: "change", rows: addressRows(r.payload) };
		case "address_add":
			return { tone: "add", rows: addressRows(r.payload) };
		case "address_remove":
			return { tone: "remove", rows: addressRows(r.payload) };
		case "relation_add":
			return { tone: "add", rows: relationRows(r.payload) };
		case "relation_remove":
			return { tone: "remove", rows: relationRows(r.payload) };
	}
}
