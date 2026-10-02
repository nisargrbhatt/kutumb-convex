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
