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

	it.each([new Error("db exploded: secret"), new AppError("LimitReached", "limit"), "str"])(
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
