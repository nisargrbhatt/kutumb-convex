import { isAppError } from "./errors";

/**
 * Member-side Change Request presentation (Suggest drawers, My requests). Pure, client-safe.
 */

export type ProfileEditMode ="direct" | "suggest" | "none";

/**
 * What the viewer's edit controls do on a member detail page. Owner/admin edit Userless Profiles
 * directly; a plain member suggests on `active` ones and edits a `draft` directly (a plain member
 * only ever sees their own drafts — read-side visibility). Linked profiles: their user edits them
 * from their own profile pages.
 */
export function profileEditMode(
	viewer: { canReview: boolean },
	profile: { userId: string | null; status: string }
): ProfileEditMode {
	if (profile.userId != null) return "none";
	if (viewer.canReview) return "direct";
	if (profile.status === "active") return "suggest";
	if (profile.status === "draft") return "direct";
	return "none";
}

export type Feedback = { type: "success" | "info"; title: string; description?: string };

/** Toast after a profile / relation / address submit, by the seam's `SubmitResult.outcome`. */
export function submitFeedback(
	outcome: "applied" | "requested" | "unchanged",
	appliedTitle: string
): Feedback {
	switch (outcome) {
		case "requested":
			return {
				type: "success",
				title: "Sent for review",
				description: "An owner/admin will review your suggestion. Track it on My requests.",
			};
		case "unchanged":
			return { type: "info", title: "No changes" };
		case "applied":
			return { type: "success", title: appliedTitle };
	}
}

/** `Stale` (version moved since load) → reload hint; null = use the generic error toast. */
export function submitErrorFeedback(error: unknown): { title: string; description: string } | null {
	if (!isAppError(error) || error.kind !== "Stale") return null;
	return { title: "Profile changed, reload", description: error.message };
}

export type RequestOutcome = {
	tone: "muted" | "positive" | "destructive";
	summary: string;
	/** Reviewer's approve note / reject reason. */
	note: string | null;
};

/** My requests "Outcome": what happened to a request, by whom, with their note / reason. */
export function requestOutcome(r: {
	status: string;
	resolvedByName: string | null;
	resolutionNote: string | null;
}): RequestOutcome {
	const by = r.resolvedByName ? ` by ${r.resolvedByName}` : "";
	switch (r.status) {
		case "approved":
			return { tone: "positive", summary: `Approved${by}`, note: r.resolutionNote };
		case "rejected":
			return { tone: "destructive", summary: `Rejected${by}`, note: r.resolutionNote };
		case "withdrawn":
			return { tone: "muted", summary: "You withdrew it", note: null };
		case "superseded":
			return {
				tone: "muted",
				summary: "Closed: the profile was linked, deactivated or deleted",
				note: null,
			};
		default:
			return { tone: "muted", summary: "Awaiting review", note: null };
	}
}
