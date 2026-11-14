# Rich text editor options

Type: research Status: resolved Blocked by:

## Question

Which editor fits the Memory description: formatted text only (bold, lists, links, headings), no
inline media? Compare Tiptap, Lexical and any lighter option on SSR safety under Workers, bundle
size, mobile behaviour, accessibility, and react-hook-form integration.

Cover storage format (JSON, HTML, Markdown), server-side sanitizing that runs in a Worker, rendering
without an editor bundle on read pages, and producing stripped text for cards.

## Answer

Tiptap 3 (106 KB brotli), lazy-loaded in the create/edit Drawer, stored as JSON. A shared zod
allowlist validates it in the Worker, so no HTML sanitizer is needed. Tiptap's renderer alone isn't
enough: it kept client-sent link `target`, `rel` and `class`. Read pages use
`@tiptap/static-renderer/json/react` (0.4 KB brotli, no ProseMirror). Cards use a plain-text column
written at save time. Lexical rejected: HTML export failed in workerd, JSON 2.4x larger. DOMPurify
is unusable in workerd.

Unverified: real phones, screen readers, hydration, the project's Vite build, a deployed Worker.
Gated on a device smoke test, with textarea + Markdown as fallback.

Findings: `.scratch/storage-and-feed/research/rich-text-editor-options.md` on branch
`research/rich-text-editor-options`.

**Superseded** by [Memory description format](13-memory-description-format.md): the device gate
can't be passed, so the textarea + Markdown fallback ships.
