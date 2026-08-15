import { describe, expect, it } from "vitest";
import { mapSubscriptionStatus } from "./billing-status-map";

describe("mapSubscriptionStatus", () => {
	it("maps no row to pending", () => {
		expect(mapSubscriptionStatus(undefined)).toBe("pending");
		expect(mapSubscriptionStatus(null)).toBe("pending");
	});

	it("maps incomplete states to pending", () => {
		expect(mapSubscriptionStatus("incomplete")).toBe("pending");
		expect(mapSubscriptionStatus("incomplete_expired")).toBe("pending");
	});

	it("maps active and trialing to active", () => {
		expect(mapSubscriptionStatus("active")).toBe("active");
		expect(mapSubscriptionStatus("trialing")).toBe("active");
	});

	it("maps past_due and unpaid to past_due", () => {
		expect(mapSubscriptionStatus("past_due")).toBe("past_due");
		expect(mapSubscriptionStatus("unpaid")).toBe("past_due");
	});

	it("maps paused and canceled to pending", () => {
		expect(mapSubscriptionStatus("paused")).toBe("pending");
		expect(mapSubscriptionStatus("canceled")).toBe("pending");
	});
});
