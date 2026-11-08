import { describe, expect, it } from "vitest";
import { postShareUrl, shareMethod } from "./shareLink";

describe("Share link", () => {
	it("is the plain Post URL: no org, no title", () => {
		expect(postShareUrl("https://kutumb.app", "p 1/x")).toBe("https://kutumb.app/feed/p%201%2Fx");
	});

	it("uses the native sheet on touch only, else copies", () => {
		expect(shareMethod({ hasNativeShare: true, coarsePointer: true })).toBe("native");
		expect(shareMethod({ hasNativeShare: true, coarsePointer: false })).toBe("copy");
		expect(shareMethod({ hasNativeShare: false, coarsePointer: true })).toBe("copy");
	});
});
