import { describe, expect, it } from "vitest";
import { AppError } from "./errors";
import {
	profileEditMode,
	requestOutcome,
	submitErrorFeedback,
	submitFeedback,
} from "./memberRequests";

const userless = (status: "active" | "inactive" | "draft") => ({ userId: null, status });

describe("profileEditMode", () => {
	it("owner/admin edit any Userless Profile directly", () => {
		for (const s of ["active", "inactive", "draft"] as const)
			expect(profileEditMode({ canReview: true }, userless(s))).toBe("direct");
	});

	it("plain member suggests on active, edits own draft directly, nothing on inactive", () => {
		expect(profileEditMode({ canReview: false }, userless("active"))).toBe("suggest");
		expect(profileEditMode({ canReview: false }, userless("draft"))).toBe("direct");
		expect(profileEditMode({ canReview: false }, userless("inactive"))).toBe("none");
	});

	it("linked profiles are never edited from member detail", () => {
		const linked = { userId: "u1", status: "active" as const };
		expect(profileEditMode({ canReview: true }, linked)).toBe("none");
		expect(profileEditMode({ canReview: false }, linked)).toBe("none");
	});
});

describe("submitFeedback", () => {
	it("requested → sent for review; unchanged → no changes; applied → caller's copy", () => {
		expect(submitFeedback("requested", "Address saved")).toEqual({
			type: "success",
			title: "Sent for review",
			description: "An owner/admin will review your suggestion. Track it on My requests.",
		});
		expect(submitFeedback("unchanged", "Address saved")).toEqual({
			type: "info",
			title: "No changes",
		});
		expect(submitFeedback("applied", "Address saved")).toEqual({
			type: "success",
			title: "Address saved",
		});
	});
});

describe("submitErrorFeedback", () => {
	it("Stale → 'Profile changed, reload'; anything else falls through", () => {
		const stale = new AppError("Stale", "This record changed since you loaded it.");
		expect(submitErrorFeedback(stale)).toEqual({
			title: "Profile changed, reload",
			description: "This record changed since you loaded it.",
		});
		expect(submitErrorFeedback(new AppError("Invalid", "nope"))).toBeNull();
		expect(submitErrorFeedback(new Error("x"))).toBeNull();
	});
});

describe("requestOutcome", () => {
	const r = (
		status: string,
		extra: { resolvedByName?: string | null; resolutionNote?: string | null } = {}
	) => ({ status, resolvedByName: null, resolutionNote: null, ...extra });

	it("approved / rejected name the reviewer and carry the note or reason", () => {
		expect(
			requestOutcome(r("approved", { resolvedByName: "Asha", resolutionNote: "Thanks" }))
		).toEqual({ tone: "positive", summary: "Approved by Asha", note: "Thanks" });
		expect(
			requestOutcome(r("rejected", { resolvedByName: "Asha", resolutionNote: "Wrong person" }))
		).toEqual({ tone: "destructive", summary: "Rejected by Asha", note: "Wrong person" });
		expect(requestOutcome(r("approved"))).toEqual({
			tone: "positive",
			summary: "Approved",
			note: null,
		});
	});

	it("pending / withdrawn / superseded explain themselves without a reviewer", () => {
		expect(requestOutcome(r("pending"))).toEqual({
			tone: "muted",
			summary: "Awaiting review",
			note: null,
		});
		expect(requestOutcome(r("withdrawn")).summary).toBe("You withdrew it");
		expect(requestOutcome(r("superseded")).summary).toBe(
			"Closed: the profile was linked, deactivated or deleted"
		);
	});
});
