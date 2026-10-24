import { normalizeFieldLabel, type CustomFieldDefinition } from "./customFields";
import { AppError } from "./errors";

const describeField = (d: CustomFieldDefinition) => `${d.label} (id ${d.id}, ${d.type})`;

/**
 * Field-ref resolver for AI Client input. A `field` is an exact id, else a label (case-insensitive,
 * trimmed), matched against the org's CURRENT definitions: callers load them at call time so a
 * rename or delete mid-conversation is picked up. Pure.
 *
 * Ambiguous label → `Invalid` with the matching ids; unknown (or since-deleted) → `Invalid` with
 * the current list. Reused by the filter and write tools.
 */
export function resolveFieldRef(defs: CustomFieldDefinition[], ref: string): CustomFieldDefinition {
	const byId = defs.find((d) => d.id === ref);
	if (byId) return byId;

	const wanted = normalizeFieldLabel(ref);
	const byLabel = defs.filter((d) => normalizeFieldLabel(d.label) === wanted);
	if (byLabel.length === 1) return byLabel[0]!;
	if (byLabel.length > 1) {
		throw new AppError(
			"Invalid",
			`Custom field label "${ref.trim()}" is ambiguous; use one of these ids: ${byLabel
				.map((d) => d.id)
				.join(", ")}.`
		);
	}
	throw new AppError(
		"Invalid",
		defs.length === 0
			? `Unknown custom field "${ref.trim()}": this community has no custom fields.`
			: `Unknown custom field "${ref.trim()}". Valid fields: ${defs.map(describeField).join("; ")}.`
	);
}
