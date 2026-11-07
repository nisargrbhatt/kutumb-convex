# Research: Rich text editor options for the Memory description

Ticket: `.scratch/storage-and-feed/issues/05-rich-text-editor-options.md`. Researched 2026-11-07.

## TL;DR

- **Tiptap 3** with a minimal extension set, loaded lazily in the create/edit drawer only.
- **Store Tiptap JSON**, not HTML or Markdown. Accept no HTML from clients, so no HTML sanitizer is
  needed: a shared zod allowlist validates and normalizes the JSON in the Worker.
- **Read pages** render stored JSON with `@tiptap/static-renderer/json/react`: 0.4 KB brotli, no
  ProseMirror, no `dangerouslySetInnerHTML`.
- **Feed cards** use a plain-text column written at save time by a small JSON walker.
- Lexical is 29 KB smaller, but its HTML export failed in workerd and no DOM-free renderer was
  found.
- **Not verified:** neither editor was tested on a real phone. Run a device smoke test first.

## Method

Facts come from library docs, source, GitHub and the npm registry. Three things were measured in a
throwaway directory; nothing was added to this repo:

- **Bundle size:** esbuild 0.28.2, minified ESM, React external, `production` condition, brotli
  quality 11. Engine only: no toolbar, no CSS.
- **Worker behaviour:** Miniflare 4.20260730.0 (workerd 1.20260730.1) with this repo's compatibility
  date (2026-02-24) and flags. Resolve conditions copied from `@cloudflare/vite-plugin` 1.40.0
  (`workerd, worker, module, browser`) [CF plugin]. esbuild, not the project's Vite build, plus a
  `createRequire` shim for CJS packages. Nothing was deployed.
- **CPU:** Node 26 only, so indicative. CPU time in workerd was not measured.

## Candidates

Versions and dates are from the npm registry `time` field [npm].

| Package                     | Latest  | Released   | License      | Note                                            |
| --------------------------- | ------- | ---------- | ------------ | ----------------------------------------------- |
| `@tiptap/react`             | 3.33.0  | 2026-11-05 | MIT          | React 17-19 peer; same date for all `@tiptap/*` |
| `prosemirror-view`          | 1.42.9  | 2026-10-31 | MIT          | Tiptap's engine                                 |
| `lexical`, `@lexical/react` | 0.53.0  | 2026-10-28 | MIT          | Still 0.x; React >=18 peer                      |
| `slate-react`               | 0.147.5 | 2026-10-28 | MIT          | Still 0.x                                       |
| `quill`                     | 2.0.3   | 2024-11-30 | BSD-3-Clause | Last commit 2025-07-25 [Quill]                  |
| `@mdxeditor/editor`         | 4.5.0   | 2026-11-02 | MIT          | Depends on Lexical; 57 direct deps              |
| `overtype`                  | 2.7.0   | 2026-10-28 | MIT          | Markdown over a native textarea                 |
| `tiny-markdown-editor`      | 0.2.35  | 2026-10-16 | MIT          | Markdown; hides and mirrors a textarea          |
| `react-simple-wysiwyg`      | 3.4.1   | 2025-09-09 | MIT          | `execCommand` based                             |

Both main repos are active: Tiptap v3.33.0 and Lexical v0.53.0 are their latest GitHub releases
[Tiptap releases] [Lexical releases].

## Comparison

| Criterion            | Tiptap 3                               | Lexical 0.53                             | Textarea + Markdown             |
| -------------------- | -------------------------------------- | ---------------------------------------- | ------------------------------- |
| SSR in workerd       | Pass: renders empty shell, no crash    | Pass: renders `contentEditable` shell    | Pass expected; not tested       |
| Editor size (brotli) | 106.2 KB                               | 77.0 KB                                  | 0 (plain) to 34.8 KB (OverType) |
| Mobile               | Open Android/iOS bugs; untested        | Open Android/iOS bugs; untested          | Native input                    |
| Accessibility        | `role="textbox"` default; guide exists | `role="textbox"` default; no guide found | Native                          |
| react-hook-form      | `Controller`                           | `Controller` + `OnChangePlugin`          | `register`                      |
| DOM-free render      | Yes, verified in workerd               | No: HTML export failed                   | Yes (`marked`)                  |
| User sees            | Formatted text                         | Formatted text                           | Markdown syntax                 |

### SSR under Workers

- **Tiptap:** docs require client-only initialization via `immediatelyRender: false` [Tiptap React].
  `useEditor` also forces it off when it detects SSR [useEditor src]. In workerd, importing
  `@tiptap/react` and `renderToString` passed with `true`, `false` and unset.
- **Lexical:** `LexicalComposer` with `RichTextPlugin` passed `renderToString` in workerd.
- Hydration in a browser was not tested for either. The recommended lazy drawer avoids SSR of the
  editor altogether. TanStack's `ClientOnly` is the alternative [ClientOnly].

### Bundle size

| Client entry                        | Min KB | Gzip KB | Brotli KB |
| ----------------------------------- | -----: | ------: | --------: |
| Tiptap minimal extensions           |  388.4 |   124.0 |     106.2 |
| Tiptap `StarterKit`                 |  402.7 |   127.7 |     109.1 |
| Tiptap minimal + `@tiptap/markdown` |  451.6 |   143.5 |     122.9 |
| Lexical rich text, list, link       |  277.6 |    90.1 |      77.0 |
| Raw ProseMirror (reference)         |  203.1 |    62.9 |      55.1 |
| Slate + history                     |  244.7 |    69.7 |      56.5 |
| Quill                               |  200.1 |    58.3 |      50.5 |
| OverType                            |  145.0 |    40.6 |      34.8 |
| TinyMDE                             |   62.7 |    18.4 |      15.8 |
| `react-simple-wysiwyg`              |    9.5 |     4.0 |       3.5 |

`StarterKit` costs only 3 KB over hand-picked extensions, so choose extensions for the allowlist,
not for size. The 29 KB gap to Lexical applies only when the drawer opens.

### Mobile

- The Tiptap and Lexical pages read make no mobile support claim [Tiptap React] [Lexical intro]
  [Lexical FAQ].
- Open issues whose titles match mobile terms: Tiptap 29 of 762 (3.8%), Lexical 16 of 386 (4.1%).
  This is a crude title regex from the GitHub API, but it shows no clear winner.
- Tiptap issues relevant here: Android Chrome scrolls the page when typing in a bottom-positioned
  editor [T7757]; fast backspace on Android deletes wrong content [T4315]; iPad Safari page freeze
  [T7514].
- Lexical issues relevant here: iOS dictation deletes words [L6940]; holding backspace on Android
  jumps the cursor [L5413]; bold/italic unusable on Android WebView 12 [L7886].
- A native textarea avoids this class of bug. OverType advertises native mobile behaviour; that is
  the vendor's claim, though it does use a real textarea [OverType].

### Accessibility

- **Tiptap:** sets `role="textbox"` by default [Editor src]. It ships no UI, so accessibility of the
  interface is left to the integrator [Tiptap a11y]. Add `aria-label` or `aria-labelledby`, a
  toolbar role and keyboard reach. `src/components/ui/toggle-group.tsx` can back the toolbar.
- **Tab in lists:** Tiptap binds Tab to `sinkListItem` [ListItem src], so inside a list it can
  indent rather than leave the editor. Check this during the keyboard test.
- **Lexical:** `ContentEditable` rendered `role="textbox"` and passed `aria-label` through in the
  SSR test. The intro lists accessibility as a goal, with no WCAG detail [Lexical intro].
- **`react-simple-wysiwyg`:** every toolbar button has `tabIndex: -1` and links use `prompt()` [RSW
  src]. That breaks the accessibility rule in `CLAUDE.md`.

### react-hook-form

Use `Controller`. For a component without a DOM ref, pass an object with `focus` to `field.ref` so
error focus works [RHF]. Sketch, not run:

```tsx
const editor = useEditor({
	extensions,
	content: field.value,
	immediatelyRender: false,
	onUpdate: ({ editor }) => field.onChange(editor.getJSON()),
	onBlur: field.onBlur,
});
useEffect(() => field.ref({ focus: () => editor?.commands.focus() }), [editor]);
```

- `content` is initial only. Remount with `key` per drawer open, or call
  `setContent(value, { emitUpdate: false })` [setContent src].
- The same zod schema can serve as resolver and server check. Keep it free of `@tiptap/*` imports.
- Lexical is equivalent, through `OnChangePlugin` and `editor.setEditorState`.

## Lighter options

- **Textarea + Markdown:** the only real alternative. Best on mobile, accessibility and form wiring,
  and the fallback if the device test fails. The cost is that members see `**bold**` syntax.
- **`react-simple-wysiwyg`:** rejected. MDN marks `execCommand` deprecated [MDN], the toolbar is not
  keyboard reachable, and it emits raw HTML.
- **Quill:** rejected. No release for nearly two years, 664 open issues and PRs [Quill].
- **Slate:** rejected. Still 0.x, and everything must be built by hand for a 20 KB saving on
  Lexical.
- **Raw ProseMirror:** saves 51 KB but loses Tiptap's React bindings and extensions.
- **MDXEditor:** rejected. Lexical plus 57 direct dependencies for an MDX feature set.

## Storage format

Size for the same short sample (heading, bold, link, two-item list):

| Format                   | Bytes | Verdict                                                    |
| ------------------------ | ----: | ---------------------------------------------------------- |
| Tiptap JSON (normalized) |   583 | **Use.** Validates as data; render rules can change later  |
| Lexical JSON             | 1,404 | 2.4x larger; carries `detail`, `mode`, `style`, `version`  |
| HTML                     |   195 | Needs a sanitizer on write; XSS risk if a step is skipped  |
| Markdown                 |    76 | Smallest, but needs a parser and a sanitizer on every path |

- Tiptap treats JSON and HTML as equally workable, and says user input needs validating either way
  [Tiptap output].
- `@tiptap/markdown` is marked an early release that may change [Tiptap MD]. It adds 17 KB brotli.
- Size is not a constraint: D1 allows 2,000,000 bytes per row [D1 limits].

## Sanitizing in a Worker

| Option                              | workerd result                                                 | Verdict    |
| ----------------------------------- | -------------------------------------------------------------- | ---------- |
| zod allowlist on Tiptap JSON        | Rejected all bad inputs below; strips extra attrs              | **Use**    |
| `.check()` + `renderToHTMLString`   | Works, but passes attr values through (see below)              | Not enough |
| `sanitize-html` 2.18.1 (2026-10-14) | Works with `nodejs_compat`; 51.3 KB brotli; pulls in `postcss` | HTML path  |
| `HTMLRewriter`                      | Same output on a shorter payload                               | Avoid      |
| `dompurify` 3.4.17 (2026-10-12)     | No DOM: `isSupported` false, `sanitize` undefined              | Unusable   |
| `dompurify` + `linkedom`            | **Returned `<img src=x onerror=alert(1)>` unchanged**          | Dangerous  |

- **Tiptap's renderer is not an allowlist on its own.** With `renderToHTMLString` in workerd:
  - Link attrs from client JSON survived: `target="_top" rel="opener" class="evil"`. `onclick` and
    `style` were dropped.
  - `javascript:` and `data:` links became `href=""`, thanks to `isAllowedUri` [Link src].
  - Text was escaped and unknown nodes threw.
  - Bare text directly in `doc` rendered, because only `.check()` rejects it.
- **The zod allowlist was verified in Node** against `Node.fromJSON().toJSON()` output, not a live
  editor (zod 4.6.7; the repo locks 4.6.5). It rejected a `javascript:` link, an `image` node, bare
  text in `doc`, an `h1` and an unknown mark. It reduced link attrs to `href`, and the result still
  passed ProseMirror's `.check()`.
- **DOMPurify:** its README says a server needs a DOM, that the DOM is part of what you must trust,
  and that happy-dom is not considered safe [DOMPurify]. Do not shim it.
- **`HTMLRewriter`:** the docs make no sanitizing claims [HTMLRewriter], and it is not a Node
  global, so this repo's plain Vitest setup could not exercise it.
- **`sanitize-html`:** moved into the Apostrophe monorepo and is maintained there [sanitize-html].
  Use it only if HTML or Markdown ever becomes an input. Recheck under the real Vite build then.
- **Lexical** kept `javascript:alert(1)` in both JSON and Markdown output, so it needs the same
  server allowlist. Unknown node types threw on parse, which is the right failure mode.
- **CPU:** a 14 KB JSON document (about 5,000 characters) took 0.06 ms warm for zod plus strip, and
  0.44 ms warm for `renderToHTMLString` with its schema build. Node numbers, against a 10 ms Free
  plan limit [Workers limits]. Not a concern, and writes are rare.

## Reading without an editor bundle

| Renderer                                        | Client brotli KB | Note                              |
| ----------------------------------------------- | ---------------: | --------------------------------- |
| `@tiptap/static-renderer/json/react`            |              0.4 | Plus our mapping; no ProseMirror  |
| Server-rendered HTML string                     |                0 | Needs `dangerouslySetInnerHTML`   |
| `marked`                                        |             13.1 | Markdown storage only             |
| `react-markdown` + `rehype-sanitize`            |             33.5 | Markdown storage only             |
| `@tiptap/static-renderer/pm/react` + StarterKit |            101.4 | **Trap:** nearly the whole editor |

- The `json` renderers have no ProseMirror dependency and need a mapping for each node and mark
  [Tiptap static]. Use `json/html-string` for strings: the docs say `json/html`, but the package
  exports `./json/html-string`.
- Verified in workerd: `renderJSONContentToReactElement` produced correct markup with `<` escaped.
  Our mapping emits only `href`, and its URL check omitted the anchor for a `javascript:` link.
- Unmapped types throw `missing handler for node type`. Set `unhandledNode` and `unhandledMark`
  [Tiptap static] so a read page cannot crash on a future kind of content.
- Tailwind Preflight strips heading sizes and list markers [Preflight], so one shared content class
  must style both the editor and read views. `@tailwindcss/typography` 0.5.20 (2026-06-08) is not
  installed; a few lines of CSS cover this small set.

## Stripped text for cards

- **Compute at write time** with a small recursive walker over validated JSON, collapsing
  whitespace. Verified output: `Diwali 2026 Hello bold site one nested`.
- Tiptap's `generateText` works in workerd but pulls in ProseMirror and left extra spaces around
  lists (`site   one  two`). Lexical's `getTextContent()` also works headless.
- Truncate for display with CSS `line-clamp`. If a server cap is needed, use `Intl.Segmenter`, which
  works in workerd: `કુટુંબ` is 6 code units but 3 graphemes, so `.slice()` can split a character.

## Lexical HTML on a Worker

- `$generateHtmlFromNodes` without a DOM threw error 338, as expected [Lexical errors].
- `withDOM()` needs happy-dom [Lexical headless]. Under the plugin's `browser` condition it resolved
  to the browser build and threw error 318 [Lexical errors].
- Without `browser`, the happy-dom build failed at startup: no `node:child_process` at this
  compatibility date. Cloudflare provides only a non-functional stub from 2026-03-17 [CF Node]; a
  later date was not tested.
- Lexical JSON, text and Markdown all worked headless. A Lexical read path would still mean a
  hand-written renderer for its format, since no equivalent to Tiptap's static renderer appeared in
  the pages read.

## Not verified

- Real devices: iOS Safari, Android Chrome, Gboard, Indic input and dictation inside the drawer.
- Screen reader behaviour.
- Browser hydration, and the project's actual Vite build.
- A deployed Worker, and CPU time in workerd.

## Sources

- [npm]: https://registry.npmjs.org/ "each package's `time` and `dist-tags`, fetched 2026-11-07"
- [CF plugin]: `node_modules/@cloudflare/vite-plugin/dist/index.mjs`, `defaultConditions`, v1.40.0
- [Tiptap releases]: https://github.com/ueberdosis/tiptap/releases
- [Lexical releases]: https://github.com/facebook/lexical/releases
- [Quill]: https://github.com/slab/quill
- [Tiptap React]: https://tiptap.dev/docs/editor/getting-started/install/react
- [useEditor src]: https://github.com/ueberdosis/tiptap/blob/main/packages/react/src/useEditor.ts
- [Editor src]: https://github.com/ueberdosis/tiptap/blob/main/packages/core/src/Editor.ts
- [ListItem src]:
  	https://github.com/ueberdosis/tiptap/blob/main/packages/extension-list/src/item/list-item.ts
- [setContent src]:
  	https://github.com/ueberdosis/tiptap/blob/main/packages/core/src/commands/setContent.ts
- [Link src]: https://github.com/ueberdosis/tiptap/blob/main/packages/extension-link/src/link.ts
- [Tiptap a11y]: https://tiptap.dev/docs/guides/accessibility
- [Tiptap output]: https://tiptap.dev/docs/guides/output-json-html
- [Tiptap static]: https://tiptap.dev/docs/editor/api/utilities/static-renderer
- [Tiptap MD]: https://tiptap.dev/docs/editor/markdown
- [Lexical intro]: https://lexical.dev/docs/intro
- [Lexical FAQ]: https://lexical.dev/docs/faq
- [Lexical headless]: https://lexical.dev/docs/concepts/headless
- [Lexical errors]: https://github.com/facebook/lexical/blob/main/scripts/error-codes/codes.json
- [T7757]: https://github.com/ueberdosis/tiptap/issues/7757
- [T4315]: https://github.com/ueberdosis/tiptap/issues/4315
- [T7514]: https://github.com/ueberdosis/tiptap/issues/7514
- [L6940]: https://github.com/facebook/lexical/issues/6940
- [L5413]: https://github.com/facebook/lexical/issues/5413
- [L7886]: https://github.com/facebook/lexical/issues/7886
- [OverType]: https://github.com/panphora/overtype
- [RSW src]: `react-simple-wysiwyg` 3.4.1, `lib/index.es.mjs`
- [MDN]: https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand
- [RHF]: https://react-hook-form.com/docs/usecontroller/controller
- [ClientOnly]: https://tanstack.com/router/latest/docs/api/router/clientOnlyComponent
- [DOMPurify]: https://github.com/cure53/DOMPurify/blob/main/README.md
- [sanitize-html]: https://github.com/apostrophecms/apostrophe/tree/main/packages/sanitize-html
- [HTMLRewriter]: https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/
- [CF Node]: https://developers.cloudflare.com/workers/runtime-apis/nodejs/
- [Workers limits]: https://developers.cloudflare.com/workers/platform/limits/
- [D1 limits]: https://developers.cloudflare.com/d1/platform/limits/
- [Preflight]: https://tailwindcss.com/docs/preflight

## Recommendation

**Use Tiptap 3, stored as JSON, with no editor code on read pages.**

1. **Editor:** `@tiptap/react` with paragraph, heading (levels 2-3), bold, italic, bullet and
   ordered lists, link, hard break and undo. The extension list is the paste allowlist too, so
   inline media cannot enter. Toolbar from `toggle-group.tsx`, loaded with `React.lazy` in the form
   drawer.
2. **Write path:** a shared pure zod schema validates and normalizes JSON in the server function,
   allowing only listed nodes, marks and link schemes. Add size and depth limits. Then derive the
   plain text.
3. **Storage:** description JSON plus a plain-text column. No HTML column.
4. **Read path:** one `MemoryDescription` component using `json/react`, with `rel` and `target` set
   by our mapping, a second URL check, and `unhandledNode`/`unhandledMark` fallbacks.
5. **Guard:** read routes import only `@tiptap/static-renderer/json/react` from `@tiptap`. Confirm
   in the build output that no ProseMirror chunk loads on the Feed.
6. **Gate:** before the spec locks this in, prototype the editor in the drawer and test on iOS
   Safari and Android Chrome with Gboard, including Indic input and dictation. If it fails badly,
   fall back to textarea + Markdown with `marked` and `sanitize-html`, which both ran in workerd.

Why not Lexical: its 29 KB saving lands only on the lazy editor chunk, while its JSON is 2.4x
larger, it is still 0.x, and it needs a hand-written renderer because HTML export failed in workerd.

Open for ticket 13:

- Length limit: stripped characters or JSON bytes?
- Link schemes: `http`, `https`, `mailto` only?
- Heading levels: 2-3 enough?
- Italic and hard break in scope? The brief names only bold, lists, links, headings.
