import { describe, expect, it } from "vitest";
import { CONNECTION_EXPIRY_MS, connectionActivity } from "./connections";

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

describe("connectionActivity", () => {
	it("no refresh yet (only the first token) → Never, active", () => {
		const a = connectionActivity(
			{ connectedAt: NOW - DAY, tokenCount: 1, newestTokenAt: NOW - DAY },
			NOW
		);
		expect(a).toEqual({ lastUsedAt: null, status: "active" });
	});

	it("no token at all → Never, judged from connection time", () => {
		expect(
			connectionActivity({ connectedAt: NOW - DAY, tokenCount: 0, newestTokenAt: null }, NOW)
		).toEqual({ lastUsedAt: null, status: "active" });
		expect(
			connectionActivity({ connectedAt: NOW - 31 * DAY, tokenCount: 0, newestTokenAt: null }, NOW)
				.status
		).toBe("expired");
	});

	it("refreshed → last used is the newest token", () => {
		const a = connectionActivity(
			{ connectedAt: NOW - 10 * DAY, tokenCount: 3, newestTokenAt: NOW - 2 * DAY },
			NOW
		);
		expect(a).toEqual({ lastUsedAt: NOW - 2 * DAY, status: "active" });
	});

	it("expired after more than 30d without a refresh", () => {
		const at = (ago: number) =>
			connectionActivity(
				{ connectedAt: NOW - 90 * DAY, tokenCount: 4, newestTokenAt: NOW - ago },
				NOW
			).status;
		expect(at(CONNECTION_EXPIRY_MS)).toBe("active");
		expect(at(CONNECTION_EXPIRY_MS + 1)).toBe("expired");
	});

	it("expired keeps its last-used date", () => {
		const a = connectionActivity(
			{ connectedAt: NOW - 90 * DAY, tokenCount: 2, newestTokenAt: NOW - 40 * DAY },
			NOW
		);
		expect(a).toEqual({ lastUsedAt: NOW - 40 * DAY, status: "expired" });
	});
});
