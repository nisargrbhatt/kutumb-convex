import { z } from "zod";
import { COMMUNITY_PROFILE_STATUS } from "@/db/constants";
import type { SubmitResult } from "@/domain/profileChanges";

/** Result of every write tool (spec § Write tools). `requested` / `possible_duplicate` are not errors. */
export const writeResultOutput = z.object({
	outcome: z
		.enum(["applied", "requested", "unchanged", "possible_duplicate"])
		.describe(
			"applied: live now. requested: submitted for owner/admin review, NOT live until approved. unchanged: nothing to do (already so). possible_duplicate: nothing written; see candidates."
		),
	profileId: z.string().optional().describe("The profile affected (absent on possible_duplicate)."),
	changeRequestId: z.string().optional().describe("Present when outcome is requested."),
	version: z
		.number()
		.optional()
		.describe(
			"New version of the profile (or address) when applied; use it as expectedVersion next."
		),
	addressId: z.string().optional().describe("Address created / changed."),
	relationId: z.string().optional().describe("Relation created / removed."),
	candidates: z
		.array(
			z.object({
				id: z.string(),
				name: z.string(),
				dateOfBirth: z.string().nullable().describe("YYYY-MM-DD"),
				status: z.enum(COMMUNITY_PROFILE_STATUS),
			})
		)
		.optional()
		.describe("Existing profiles that may be the same person (possible_duplicate)."),
	message: z.string(),
});
export type WriteResult = z.infer<typeof writeResultOutput>;

export const REQUESTED_MESSAGE = "Submitted for owner/admin review; not live until approved.";

/**
 * `SubmitResult` → tool result. `applied` / `unchanged` are the per-tool sentences; ids and the
 * new version are forwarded as the seam reports them (omitted on `requested`).
 */
export function toWriteResult(
	res: SubmitResult,
	messages: { applied: string; unchanged: string }
): WriteResult {
	switch (res.outcome) {
		case "applied": {
			const { outcome, ...rest } = res;
			return { outcome, ...rest, message: messages.applied };
		}
		case "requested":
			return { ...res, message: REQUESTED_MESSAGE };
		case "unchanged":
			return { ...res, message: messages.unchanged };
	}
}
