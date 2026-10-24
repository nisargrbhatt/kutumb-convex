/**
 * MCP edge date helpers. AI Clients see calendar days (`YYYY-MM-DD`); storage keeps ISO
 * timestamps (`dateOfBirth`, `dateOfDeath`, custom `date` values). The calendar day of a stored
 * value is its UTC date (the app's DatePicker local-midnight shift is out of scope).
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` of a stored ISO timestamp (or bare day); null when empty or unparseable. */
export function storedIsoToDay(value: string | null | undefined): string | null {
	if (!value) return null;
	if (DAY.test(value)) return dayToStoredIso(value) ? value : null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/** UTC-midnight ISO timestamp of a strict, real `YYYY-MM-DD` day; null otherwise. */
export function dayToStoredIso(day: string): string | null {
	if (!DAY.test(day)) return null;
	const date = new Date(`${day}T00:00:00.000Z`);
	if (Number.isNaN(date.getTime())) return null;
	// Reject rollovers such as 2023-02-29 → 2023-03-01.
	return date.toISOString().slice(0, 10) === day ? date.toISOString() : null;
}
