import { and } from "drizzle-orm";
import { communityProfile } from "@/db/app-schema";
import { storedIsoToDay } from "@/domain/calendarDay";
import { fullName } from "@/domain/communityProfile";
import type { Actor } from "@/domain/permission";
import type { QueryDb } from "./db";
import { readRules } from "./profiles";

export const DUPLICATE_CANDIDATE_LIMIT = 5;

export type DuplicateCandidate = {
	id: string;
	name: string;
	dateOfBirth: string | null;
	status: "draft" | "active" | "inactive";
};

const norm = (s: string) => s.trim().toLowerCase();
const day = (iso: string | null) => storedIsoToDay(iso);

/**
 * Profiles the AI Client can read whose trimmed, case-insensitive first + last name equal the
 * given ones. When both sides have a date of birth and they differ it is a different person, so
 * not a match. At most `DUPLICATE_CANDIDATE_LIMIT`, ordered by id.
 *
 * Compared in JS over the readable names of the org (bounded by `PROFILE_LIMIT`) because SQLite's
 * `lower()` is ASCII-only and would miss non-ASCII case differences.
 */
export async function findDuplicateCandidates(
	db: QueryDb,
	actor: Actor,
	name: { firstName: string; lastName: string; dateOfBirth: string | null }
): Promise<DuplicateCandidate[]> {
	const { subjectWhere } = readRules(actor, "aiClient");
	const rows = await db
		.select({
			id: communityProfile.id,
			firstName: communityProfile.firstName,
			middleName: communityProfile.middleName,
			lastName: communityProfile.lastName,
			dateOfBirth: communityProfile.dateOfBirth,
			status: communityProfile.status,
		})
		.from(communityProfile)
		.where(and(subjectWhere))
		.orderBy(communityProfile.id);

	const first = norm(name.firstName);
	const last = norm(name.lastName);
	const dob = day(name.dateOfBirth);
	return rows
		.filter((r) => norm(r.firstName) === first && norm(r.lastName) === last)
		.filter((r) => !(dob && day(r.dateOfBirth) && day(r.dateOfBirth) !== dob))
		.slice(0, DUPLICATE_CANDIDATE_LIMIT)
		.map((r) => ({
			id: r.id,
			name: fullName(r),
			dateOfBirth: day(r.dateOfBirth),
			status: r.status,
		}));
}
