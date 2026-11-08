import { describe, expect, it } from "vitest";
import { MEMORY_DESCRIPTION_MAX } from "./limits";
import { parseDescription, type DescriptionDoc } from "./memoryDescription";

const ok = (source: string) => {
	const r = parseDescription(source);
	if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
	return r;
};
const para = (text: string): DescriptionDoc => [{ t: "p", c: [{ t: "text", v: text }] }];

describe("parseDescription", () => {
	it("shows a javascript: link literally", () => {
		expect(ok("[x](javascript:alert(1))").doc).toEqual(para("[x](javascript:alert(1))"));
		expect(ok("[x](JavaScript:alert(1))").doc).toEqual(para("[x](JavaScript:alert(1))"));
	});

	it("shows an image literally and never fetches it", () => {
		expect(ok("![a](https://x.test/a.png)").doc).toEqual(para("![a](https://x.test/a.png)"));
	});

	it("shows HTML literally", () => {
		expect(ok("<b>x</b>").doc).toEqual(para("<b>x</b>"));
	});

	it("shows a blockquote literally", () => {
		expect(ok("> quote").doc).toEqual(para("> quote"));
	});

	it("shows code, fences, strikethrough and hr literally", () => {
		expect(ok("`c`").doc).toEqual(para("`c`"));
		expect(ok("~~s~~").doc).toEqual(para("~~s~~"));
		expect(ok("```\nx\n```").doc).toEqual([
			{ t: "p", c: [{ t: "text", v: "```" }, { t: "br" }, { t: "text", v: "x" }] },
			{ t: "p", c: [{ t: "text", v: "```" }] },
		]);
		expect(ok("a\n\n---\n\nb").text).toBe("a --- b");
	});

	it("renders # as h2 and ## and deeper as h3", () => {
		expect(ok("# A\n## B\n### C").doc).toEqual([
			{ t: "h2", c: [{ t: "text", v: "A" }] },
			{ t: "h3", c: [{ t: "text", v: "B" }] },
			{ t: "h3", c: [{ t: "text", v: "C" }] },
		]);
	});

	it("keeps bold, italic, line breaks and allowed links", () => {
		expect(ok("**b** _i_\n[s](https://x.test) [m](MAILTO:a@x.test)").doc).toEqual([
			{
				t: "p",
				c: [
					{ t: "strong", c: [{ t: "text", v: "b" }] },
					{ t: "text", v: " " },
					{ t: "em", c: [{ t: "text", v: "i" }] },
					{ t: "br" },
					{ t: "link", href: "https://x.test", c: [{ t: "text", v: "s" }] },
					{ t: "text", v: " " },
					{ t: "link", href: "MAILTO:a@x.test", c: [{ t: "text", v: "m" }] },
				],
			},
		]);
	});

	it("auto-links pasted URLs", () => {
		expect(ok("see www.x.test").doc).toEqual([
			{
				t: "p",
				c: [
					{ t: "text", v: "see " },
					{ t: "link", href: "http://www.x.test", c: [{ t: "text", v: "www.x.test" }] },
				],
			},
		]);
	});

	it("keeps lists to 3 levels", () => {
		expect(ok("1. a\n   - b\n     - c").doc).toEqual([
			{
				t: "ol",
				start: 1,
				items: [
					[
						{ t: "p", c: [{ t: "text", v: "a" }] },
						{
							t: "ul",
							items: [
								[
									{ t: "p", c: [{ t: "text", v: "b" }] },
									{ t: "ul", items: [[{ t: "p", c: [{ t: "text", v: "c" }] }]] },
								],
							],
						},
					],
				],
			},
		]);
	});

	it("blocks lists past 3 levels", () => {
		expect(parseDescription("- a\n  - b\n    - c\n      - d").ok).toBe(false);
		expect(parseDescription("1. 1. 1. 1. x").ok).toBe(false);
	});

	it("blocks a hostile `1. 1. 1. …` at 5,000 chars without throwing", () => {
		const hostile = "1. ".repeat(Math.floor(MEMORY_DESCRIPTION_MAX / 3));
		expect(hostile.length).toBeLessThanOrEqual(MEMORY_DESCRIPTION_MAX);
		const r = parseDescription(hostile);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toMatch(/3 levels/);
	});

	it("blocks a source over the length cap", () => {
		expect(parseDescription("a".repeat(MEMORY_DESCRIPTION_MAX + 1)).ok).toBe(false);
		expect(parseDescription("a".repeat(MEMORY_DESCRIPTION_MAX)).ok).toBe(true);
	});

	it("treats a blank source as no description", () => {
		expect(ok("  \n ")).toEqual({ ok: true, source: null, doc: null, text: null });
	});

	it("strips to plain text capped at 300 chars", () => {
		expect(ok("# Title\n**b** and [l](https://x.test)\n\n- one\n- two").text).toBe(
			"Title b and l one two"
		);
		const long = ok("word ".repeat(200)).text!;
		expect(long.length).toBeLessThanOrEqual(300);
		expect(long.endsWith("…")).toBe(true);
	});
});
