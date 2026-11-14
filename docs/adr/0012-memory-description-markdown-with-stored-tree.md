# Memory description is Markdown, parsed once at save

A Memory description is typed as Markdown in a native textarea, not in a rich text editor. The
Worker parses it once at save and stores a tree of allowed nodes beside the source, so read pages
never run a parser. No real phone is available to test a `contenteditable` editor, and a measured
probe showed Markdown parsers can't safely run on read.

- **Considered**: Tiptap with JSON storage (formatted editing, but open Android and iPad bugs that
  can't be checked here, and 106 KB brotli in the Drawer); storing Markdown only and parsing on read
  behind a try/catch (one column less, but a catch doesn't stop CPU use: 5,000 hostile characters
  took about 20 ms in Node against the 10 ms Free limit, and `1. 1. 1. …` overflowed the stack in
  both `marked` and `react-markdown`).
- **Consequences**: members see Markdown syntax while writing, softened by a toolbar and a Preview
  tab. A hostile description can only hurt its own save request, never a reader's page.
  `description` stays the source of truth, so a change to render rules re-derives `descriptionDoc`
  and `descriptionText` from it. It also leaves a way back to a rich editor once phones can be
  tested.
