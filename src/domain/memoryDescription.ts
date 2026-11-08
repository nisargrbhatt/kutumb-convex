import { Marked, type Token, type Tokens } from "marked";
import {
	MEMORY_DESCRIPTION_MAX,
	MEMORY_DESCRIPTION_TEXT_MAX,
	MEMORY_LIST_DEPTH_MAX,
} from "./limits";

/**
 * Memory description: Markdown source → our own node tree + stripped card text (ADR 0012). Pure and
 * shared: the Worker calls it once at save, the Drawer's Preview calls it live. No `@/lib`, no
 * server imports. Read pages render `DescriptionDoc` with a small React mapping, never a parser.
 */

export type Inline =
	| { t: "text"; v: string }
	| { t: "br" }
	| { t: "strong"; c: Inline[] }
	| { t: "em"; c: Inline[] }
	| { t: "link"; href: string; c: Inline[] };

/** A list item is its blocks: paragraphs and at most one more level of list. */
export type Block =
	| { t: "p"; c: Inline[] }
	| { t: "h2"; c: Inline[] }
	| { t: "h3"; c: Inline[] }
	| { t: "ul"; items: Block[][] }
	| { t: "ol"; start: number; items: Block[][] };

export type DescriptionDoc = Block[];

export type ParsedDescription =
	| { ok: true; source: string | null; doc: DescriptionDoc | null; text: string | null }
	| { ok: false; error: string };

export const DESCRIPTION_ERRORS = {
	tooLong: `Description can be at most ${MEMORY_DESCRIPTION_MAX.toLocaleString("en")} characters.`,
	tooDeep: `Lists can be nested at most ${MEMORY_LIST_DEPTH_MAX} levels.`,
	unreadable: "This description couldn't be read. Simplify its formatting and try again.",
} as const;

const off = () => undefined;

/** `gfm` + `breaks`; every tokenizer we don't render is off, so its syntax shows literally. */
const marked = new Marked({
	gfm: true,
	breaks: true,
	tokenizer: {
		blockquote: off,
		code: off,
		fences: off,
		html: off,
		table: off,
		hr: off,
		lheading: off,
		def: off,
		reflink: off,
		tag: off,
		codespan: off,
		del: off,
	},
});

const ALLOWED_PROTOCOL = /^(https?|mailto):/i;

/**
 * Same-line list chains (`1. 1. 1. …`) nest one level per marker and overflow `marked`'s stack long
 * before 5,000 chars, so they're refused before parsing. Indented nesting is caught on the tree.
 */
const CHAINED_LIST = new RegExp(
	`^(?:[ \\t]*(?:[-*+]|\\d{1,9}[.)])[ \\t]+){${MEMORY_LIST_DEPTH_MAX + 1}}`,
	"m"
);

class TooDeep extends Error {}

function inline(tokens: Token[] | undefined): Inline[] {
	const out: Inline[] = [];
	const pushText = (v: string) => {
		if (!v) return;
		const last = out.at(-1);
		if (last?.t === "text") last.v += v;
		else out.push({ t: "text", v });
	};
	for (const tok of tokens ?? []) {
		switch (tok.type) {
			case "text": {
				const t = tok as Tokens.Text;
				if (t.tokens?.length)
					for (const n of inline(t.tokens)) n.t === "text" ? pushText(n.v) : out.push(n);
				else pushText(t.text);
				break;
			}
			case "escape":
				pushText((tok as Tokens.Escape).text);
				break;
			case "br":
				out.push({ t: "br" });
				break;
			case "strong":
				out.push({ t: "strong", c: inline((tok as Tokens.Strong).tokens) });
				break;
			case "em":
				out.push({ t: "em", c: inline((tok as Tokens.Em).tokens) });
				break;
			case "link": {
				const l = tok as Tokens.Link;
				const href = l.href.trim();
				if (ALLOWED_PROTOCOL.test(href)) out.push({ t: "link", href, c: inline(l.tokens) });
				else pushText(l.raw);
				break;
			}
			default:
				// Images and anything else: shown as typed, never fetched.
				pushText(tok.raw);
		}
	}
	return out;
}

function blocks(tokens: Token[], depth: number): Block[] {
	const out: Block[] = [];
	for (const tok of tokens) {
		switch (tok.type) {
			case "space":
				break;
			case "heading": {
				const h = tok as Tokens.Heading;
				out.push({ t: h.depth === 1 ? "h2" : "h3", c: inline(h.tokens) });
				break;
			}
			case "list": {
				const l = tok as Tokens.List;
				if (depth + 1 > MEMORY_LIST_DEPTH_MAX) throw new TooDeep();
				const items = l.items.map((item) => blocks(item.tokens, depth + 1));
				out.push(
					l.ordered
						? { t: "ol", start: typeof l.start === "number" ? l.start : 1, items }
						: { t: "ul", items }
				);
				break;
			}
			case "paragraph":
				out.push({ t: "p", c: inline((tok as Tokens.Paragraph).tokens) });
				break;
			case "text": {
				// Tight list item content.
				const t = tok as Tokens.Text;
				out.push({ t: "p", c: t.tokens ? inline(t.tokens) : [{ t: "text", v: t.text }] });
				break;
			}
			default:
				out.push({ t: "p", c: [{ t: "text", v: tok.raw }] });
		}
	}
	return out;
}

const inlineText = (nodes: Inline[]): string =>
	nodes
		.map((n) => {
			if (n.t === "text") return n.v;
			if (n.t === "br") return " ";
			return inlineText(n.c);
		})
		.join("");

const blockTexts = (doc: Block[]): string[] =>
	doc.flatMap((b) =>
		b.t === "ul" || b.t === "ol" ? b.items.flatMap(blockTexts) : [inlineText(b.c)]
	);

/** Card text: every block's words on one line, capped with an ellipsis. */
export function stripDescription(doc: DescriptionDoc): string {
	const text = blockTexts(doc)
		.map((s) => s.replace(/\s+/g, " ").trim())
		.filter(Boolean)
		.join(" ");
	if (text.length <= MEMORY_DESCRIPTION_TEXT_MAX) return text;
	return `${text.slice(0, MEMORY_DESCRIPTION_TEXT_MAX - 1).trimEnd()}…`;
}

/** Parse, allowlist and strip. A failure blocks the save with `error` (Preview shows the same). */
export function parseDescription(raw: string): ParsedDescription {
	if (raw.length > MEMORY_DESCRIPTION_MAX) return { ok: false, error: DESCRIPTION_ERRORS.tooLong };
	if (!raw.trim()) return { ok: true, source: null, doc: null, text: null };
	if (CHAINED_LIST.test(raw)) return { ok: false, error: DESCRIPTION_ERRORS.tooDeep };
	try {
		const doc = blocks(marked.lexer(raw), 0);
		return { ok: true, source: raw, doc, text: stripDescription(doc) || null };
	} catch (e) {
		return {
			ok: false,
			error: e instanceof TooDeep ? DESCRIPTION_ERRORS.tooDeep : DESCRIPTION_ERRORS.unreadable,
		};
	}
}
