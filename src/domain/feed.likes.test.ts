import { describe, expect, it } from "vitest";
import { withLike } from "./feed";

describe("withLike (optimistic like state)", () => {
	it("liking adds one, unliking takes one away", () => {
		expect(withLike({ count: 2, viewerLiked: false }, true)).toEqual({
			count: 3,
			viewerLiked: true,
		});
		expect(withLike({ count: 3, viewerLiked: true }, false)).toEqual({
			count: 2,
			viewerLiked: false,
		});
	});

	it("sending the state the viewer already has changes nothing", () => {
		expect(withLike({ count: 3, viewerLiked: true }, true)).toEqual({
			count: 3,
			viewerLiked: true,
		});
		expect(withLike({ count: 0, viewerLiked: false }, false)).toEqual({
			count: 0,
			viewerLiked: false,
		});
	});
});
