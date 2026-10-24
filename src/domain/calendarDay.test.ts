import { describe, expect, it } from "vitest";
import { dayToStoredIso, storedIsoToDay } from "./calendarDay";

describe("storedIsoToDay", () => {
	it("takes the calendar day of a stored ISO timestamp", () => {
		expect(storedIsoToDay("1990-01-02T00:00:00.000Z")).toBe("1990-01-02");
		expect(storedIsoToDay("2024-03-05T10:00:00.000Z")).toBe("2024-03-05");
	});

	it("passes a bare YYYY-MM-DD through", () => {
		expect(storedIsoToDay("2024-03-05")).toBe("2024-03-05");
	});

	it("null / undefined / empty / unparseable → null", () => {
		expect(storedIsoToDay(null)).toBeNull();
		expect(storedIsoToDay(undefined)).toBeNull();
		expect(storedIsoToDay("")).toBeNull();
		expect(storedIsoToDay("not a date")).toBeNull();
	});
});

describe("dayToStoredIso", () => {
	it("converts YYYY-MM-DD to UTC-midnight ISO", () => {
		expect(dayToStoredIso("1990-01-02")).toBe("1990-01-02T00:00:00.000Z");
	});

	it("round-trips", () => {
		expect(storedIsoToDay(dayToStoredIso("2024-02-29")!)).toBe("2024-02-29");
	});

	it.each(["2024-13-01", "2023-02-29", "2024-2-9", "2024-03-05T00:00:00Z", "", "05/03/2024"])(
		"rejects %j",
		(bad) => {
			expect(dayToStoredIso(bad)).toBeNull();
		}
	);
});
