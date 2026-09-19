import { describe, expect, it } from "vitest";
import { toCrossJSONAsync, fromCrossJSON } from "seroval";
import { AppError, isAppError } from "./errors";

describe("isAppError", () => {
	it("accepts an AppError instance", () => {
		expect(isAppError(new AppError("Forbidden"))).toBe(true);
	});

	it("rejects a plain Error", () => {
		expect(isAppError(new Error("boom"))).toBe(false);
	});

	it("rejects null/undefined/primitives", () => {
		expect(isAppError(null)).toBe(false);
		expect(isAppError(undefined)).toBe(false);
		expect(isAppError("Forbidden")).toBe(false);
	});

	it("carries kind, message and code", () => {
		const error = new AppError("LimitReached", "too many", "LIMIT_CODE");
		expect(error.kind).toBe("LimitReached");
		expect(error.message).toBe("too many");
		expect(error.code).toBe("LIMIT_CODE");
	});

	it("defaults message to kind when omitted", () => {
		expect(new AppError("NotFound").message).toBe("NotFound");
	});

	it("survives a seroval cross-JSON round trip (TanStack Start's error serialisation)", async () => {
		const error = new AppError("Forbidden", "nope", "FORBIDDEN_CODE");
		const json = await toCrossJSONAsync(error);
		const revived = fromCrossJSON(json, {}) as AppError;

		expect(isAppError(revived)).toBe(true);
		expect(revived.kind).toBe("Forbidden");
		expect(revived.message).toBe("nope");
		expect(revived.code).toBe("FORBIDDEN_CODE");
	});
});
