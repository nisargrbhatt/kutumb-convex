import { describe, expect, it } from "vitest";
import { isInvitationPending } from "./invitation-preview";

describe("isInvitationPending", () => {
	it("accepts a pending, unexpired invitation", () => {
		expect(
			isInvitationPending(
				{ status: "pending", expiresAt: new Date("2026-01-02") },
				new Date("2026-01-01")
			)
		).toBe(true);
	});

	it("rejects a non-pending invitation", () => {
		expect(
			isInvitationPending(
				{ status: "accepted", expiresAt: new Date("2026-01-02") },
				new Date("2026-01-01")
			)
		).toBe(false);
	});

	it("rejects an expired invitation", () => {
		expect(
			isInvitationPending(
				{ status: "pending", expiresAt: new Date("2026-01-01") },
				new Date("2026-01-02")
			)
		).toBe(false);
	});
});
