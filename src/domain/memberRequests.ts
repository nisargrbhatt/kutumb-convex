import { isAppError } from "./errors";

/**
 * Member-side Change Request presentation (Suggest drawers, My requests). Pure, client-safe.
 */

export type ProfileEditMode = "direct" | "suggest" | "none";

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
				description: "An owner/admin will review your change request. Track it on My requests.",
			};
		case "unchanged":
			return { type: "info", title: "No changes" };
		case "applied":
			return { type: "success", title: appliedTitle };
	}
}

/** "Add member" toast by the seam's create outcome (applied = active, requested = Draft Record). */
export function addMemberFeedback(outcome: "applied" | "requested"): {
	title: string;
	description: string;
} {
	return {
		title: "Member added",
		description:
			outcome === "applied"
				? "The profile is active."
				: "Added as a Draft Record. An owner/admin will approve the profile.",
	};
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

/**
 * Edit-control copy by mode: `direct` applies the change; `suggest` (plain member on an active
 * Userless Profile) submits a Change Request. One source for the Suggest drawers / dialogs.
 */
export const EDIT_COPY = {
	direct: {
		info: {
			trigger: "Edit",
			title: "Edit profile",
			description: "Changes apply directly and are recorded in the audit log.",
			submit: "Save profile",
		},
		addAddress: {
			title: "Add address",
			description: "Add an address for this profile on its behalf.",
			submit: "Add address",
		},
		editAddress: {
			title: "Edit address",
			description: "Update this address.",
			submit: "Save address",
		},
		removeAddress: {
			label: "Delete address",
			title: "Delete address?",
			description: "This will permanently delete this address. This action cannot be undone.",
			confirm: "Delete",
		},
		addRelation: {
			title: "Add relation",
			description: "Record an outgoing relation for this profile on its behalf.",
			submit: "Add relation",
		},
		removeRelation: {
			label: (name: string) => `Delete relation with ${name}`,
			title: "Delete relation",
			description: "This removes the relation. This action cannot be undone.",
			confirm: "Delete",
		},
	},
	suggest: {
		info: {
			trigger: "Suggest edit",
			title: "Suggest edit",
			description:
				"Your changes go to an owner/admin for review; only changed fields are sent. Everyone sees the current info until then.",
			submit: "Submit for review",
		},
		addAddress: {
			title: "Suggest address",
			description: "Suggest an address for this profile. An owner/admin reviews it.",
			submit: "Submit for review",
		},
		editAddress: {
			title: "Suggest address edit",
			description: "Your changes go to an owner/admin for review; only changed fields are sent.",
			submit: "Submit for review",
		},
		removeAddress: {
			label: "Suggest address removal",
			title: "Suggest removing this address?",
			description: "An owner/admin reviews the removal. The address stays until then.",
			confirm: "Submit for review",
		},
		addRelation: {
			title: "Suggest relation",
			description: "Suggest an outgoing relation for this profile. An owner/admin reviews it.",
			submit: "Submit for review",
		},
		removeRelation: {
			label: (name: string) => `Suggest removing relation with ${name}`,
			title: "Suggest removing this relation?",
			description: "An owner/admin reviews the removal. The relation stays until then.",
			confirm: "Submit for review",
		},
	},
} as const;

/** `suggest` flag → its copy set. */
export const editCopy = (suggest: boolean) => EDIT_COPY[suggest ? "suggest" : "direct"];
