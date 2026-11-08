# Memory description format

Type: grilling Status: resolved Blocked by: 05, 17

## Question

How is the Memory description stored, sanitized and rendered, and how is stripped card text
produced: at write time or read time? What are the length limit and allowed link schemes?

Device smoke test will not happen: [Real device and plan checks](17-real-device-and-plan-checks.md).
So also decide: ship Tiptap untested on phones, or take the textarea + Markdown fallback from
[Rich text editor options](05-rich-text-editor-options.md)?

## Answer

Textarea + Markdown, not Tiptap: the device gate can't be passed, and the standing rule is to
restrict rather than depend on the unverified. Parsed once at save
([ADR 0012](../../../docs/adr/0012-memory-description-markdown-with-stored-tree.md)).

Storage, on `postMemory`:

- `description`: Markdown as typed, source of truth, loaded by the edit Drawer.
- `descriptionDoc`: JSON tree of allowed nodes, read by the detail page. Our own small node shape,
  not `marked` tokens, so the library can change.
- `descriptionText`: stripped text capped at 300 characters, read by cards. Feed `load` selects this,
  not the tree or source.
- All three written by the Worker on create and edit. Nothing derived is accepted from the client.
- A render rule change re-derives the two derived columns from `description`.

Parsing:

- `marked` with `gfm` and `breaks: true`, so a single Enter is a line break. Blockquote, code, fences,
  HTML, table, hr, setext heading, reference link, tag, codespan and strikethrough tokenizers off.
- One pure shared module does parse, allowlist and strip. No `@/lib` or server imports: the Worker
  and the Preview tab both call it, so Preview matches what saves.
- Read pages have no parser: a small recursive React mapping over the tree, no
  `dangerouslySetInnerHTML`.

Allowed:

- Paragraphs, line breaks, bold, italic, bullet and numbered lists nested up to 3 levels, links, and
  headings. `#` renders as `h2`, `##` or deeper as `h3`: the title owns the page heading.
- Links: `http`, `https`, `mailto` only, checked case-insensitively by us, because `marked` keeps
  `javascript:` hrefs in its tokens. Pasted URLs auto-link. New tab, `rel="noopener noreferrer"`.
- Anything else shows literally as typed: `> quote`, `<b>x</b>`, `![a](url)`, `[x](javascript:…)`. No
  remote image is ever fetched.

Limits and errors:

- At most 5,000 characters, counted on the source. Empty allowed. Constant in `src/domain/limits.ts`.
- A parser throw or lists past 3 levels block the save with one inline error on the field. Preview
  catches the same failure and shows the error too.

Drawer:

- Write and Preview tabs. Toolbar: Heading, Bold, Italic, Bullet list, Numbered list, Link. Buttons
  wrap the selection with `setRangeText` on the native textarea. If one misbehaves on a phone, typing
  still works.
- `register` from react-hook-form. Text at least 16 px. `marked` loads lazily with the Drawer.
- One shared content class styles Preview and the detail page: Preflight strips heading sizes and
  list markers. No `@tailwindcss/typography`.

Probe, 5,000 characters, Node timings, not workerd. Restricted `marked` 18.1.3: normal text 0.6 ms,
`_a_a…` 19.7 ms, `1. 1. …` stack overflow, also seen in local workerd. `react-markdown` 10.1.0: normal
text 7.4 ms, `*a*a…` 31.4 ms, stack overflow on `1. 1. …` and `>>>…`. CPU in workerd not measured, so
a hostile save may hit Error 1102: harm stays on that request.

Not verified: `marked` under the project's Vite build, a real phone keyboard with the toolbar.
