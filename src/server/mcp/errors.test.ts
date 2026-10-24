import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/domain/errors";
import { toolErrorResult } from "./errors";

afterEach(() => vi.restoreAllMocks());

describe("toolErrorResult", () => {
	it.each(["NotFound", "Forbidden"] as const)("%s → isError with its message", (kind) => {
		expect(toolErrorResult(new AppError(kind, "nope"))).toEqual({
			isError: true,
			content: [{ type: "text", text: "nope" }],
		});
	});

	it("Invalid → isError with its message, which carries the hint", () => {
		const message = 'Operator "gt" does not apply to text field "Gotra". Use one of: eq, contains.';
		expect(toolErrorResult(new AppError("Invalid", message))).toEqual({
			isError: true,
			content: [{ type: "text", text: message }],
		});
	});

	it.each([
		["connection_read_only", "reconnect", "Read and make changes"],
		["org_writes_off", "owner", "Settings → AI"],
	] as const)("WriteNotAllowed (%s) → isError with reason and a static hint", (reason, ...hint) => {
		const result = toolErrorResult(new AppError("WriteNotAllowed", undefined, reason));
		expect(result.isError).toBe(true);
		const text = (result.content[0] as { text: string }).text;
		expect(text).toContain("WriteNotAllowed");
		expect(text).toContain(reason);
		for (const part of hint) expect(text.toLowerCase()).toContain(part.toLowerCase());
	});

	it("Stale → isError, re-read and retry with the new version", () => {
		const result = toolErrorResult(new AppError("Stale", "internal wording"));
		const text = (result.content[0] as { text: string }).text;
		expect(result.isError).toBe(true);
		expect(text).toContain("Stale");
		expect(text).toContain("get_profile");
		expect(text).toContain("version");
		expect(text).not.toContain("internal wording");
	});

	it("Conflict → isError, re-read and retry", () => {
		const text = (toolErrorResult(new AppError("Conflict", "x")).content[0] as { text: string })
			.text;
		expect(text).toContain("Conflict");
		expect(text).toContain("get_profile");
	});

	it("LimitReached → isError with the limit copy and a stop-and-tell-the-user hint", () => {
		const pending = toolErrorResult(
			new AppError("LimitReached", undefined, "PENDING_REQUEST_LIMIT_REACHED")
		);
		const text = (pending.content[0] as { text: string }).text;
		expect(pending.isError).toBe(true);
		expect(text).toContain("LimitReached");
		expect(text).toContain("50 requests waiting for review");
		expect(text.toLowerCase()).toContain("tell the user");

		const quota = toolErrorResult(
			new AppError("LimitReached", "Write quota reached, resets in ~12 min.", "WRITE_QUOTA_REACHED")
		);
		expect((quota.content[0] as { text: string }).text).toContain("resets in ~12 min");
	});

	it.each([new Error("db exploded: secret"), new AppError("NoActiveOrg", "limit"), "str"])(
		"%s → generic Internal error, detail only on console.error",
		(error) => {
			const spy = vi.spyOn(console, "error").mockImplementation(() => {});
			const result = toolErrorResult(error);
			expect(result).toEqual({
				isError: true,
				content: [{ type: "text", text: "Internal error" }],
			});
			expect(spy).toHaveBeenCalled();
		}
	);
});
