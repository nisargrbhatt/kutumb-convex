# Real device and plan checks

Type: task Status: resolved Blocked by:

## Question

Research ran on a Mac only. Gather the facts later decisions wait on, using a throwaway deploy:

- [ ] Confirm Cloudflare zone plan (100 MB body cap assumed) and Workers Paid.
- [ ] Real iPhone: what iOS Safari delivers from Photos and from Files (JPEG or raw HEIC).
- [ ] Real iPhone: `<video>` plays from a route gated by the HttpOnly session cookie, with `206`.
- [ ] Real phones: Tiptap typing, selection and toolbar on iOS and Android.
- [ ] Deployed Worker: a 100,000,000-byte `put()` passes the body cap, one byte over the zone limit
  gives 413, and CPU stays within limits.
- [ ] Real iPhone: size and codec of a picked video against the original (100 MB cap).
- [ ] Deployed Worker: JPEG marker walk and video atom scrub within memory and CPU limits.
- [ ] Deployed Worker: custom `src/server.ts` runs `scheduled` alongside TanStack `fetch`.
- [ ] Real phones: crop drag, pinch and sliders inside the Drawer, with no page scroll fighting them.
- [ ] Real phones: Feed mosaic, lightbox swipe and comment composer on iOS and Android.
- [ ] Signed in: Feed prototype on `/memories` inside the real shell.

## Answer

Device and deploy checks not run: the owner has no real phones or throwaway deploy setup, and chose
to restrict features over checking them. Every path below is built so its unknown can't break it.

Facts gathered:

- Zone `nisargbhatt.org` is on Free: 100 MB body cap, per the Workers limits docs.
- Workers plan unknown: Wrangler's token can't read subscriptions. Design to Free limits (10 ms CPU,
  50 subrequests). Paid then only adds headroom.
- Custom `src/server.ts` works in local workerd: `scheduled` ran from a built app, and `fetch`
  reached TanStack SSR. Local run needs `assets` removed from the config: with them, the trigger
  returned `exception`. Prod with assets not verified.

Restrictive defaults, for the spec:

- **Worker never copies or rewrites bytes.** Upload is `put(request.body)`, then header and range
  reads; a bad file is deleted and rejected. CPU no longer grows with file size.
- **Browser strips, Worker verifies.** Canvas JPEGs carry no metadata, and the Worker rejects any
  APP1 before SOS. The browser renames `meta`/`udta` to `free` in a new `Blob` built from `File`
  slices. The Worker walks atoms and rejects leftover location data. **Overrides** the Worker strip
  and streamed copy in [Server-side blob verification](03-server-side-blob-verification.md).
- **Video cap 95,000,000 bytes.** Margin under the unverified 100 MB edge. A Cloudflare `413` shows
  the same size message. **Overrides** 100,000,000 in
  [Upload limits and storage quotas](12-upload-limits-and-quotas.md).
- **No assumption on what a phone delivers.** Size and codec are checked on the picked file. A photo
  `createImageBitmap` can't decode gets an inline error.
- **Media failure degrades.** `<video>` error shows poster plus download link. Avatar error shows
  initials, gallery image error a placeholder.
- **Blob route runs in `src/server.ts`, ahead of TanStack.** Its CPU is unmeasured, and the TanStack
  stack is the cost most likely to hit 10 ms.
- **Sweep sized for Free:** at most 40 subrequests per run. Pending cap counts only unexpired rows, so
  a missed cron can't lock a member out.
- **No gesture-only path.** Crop has sliders, lightbox has visible previous, next and close buttons,
  comment composer text is at least 16 px. Crop stage sets `touch-action: none`.

Free also caps the account at 100,000 Worker requests a day, and every blob read is one. Browser
caching and the tree's zoom threshold keep that down. Over the cap, the whole app returns Error 1027.

If production shows Error 1102 or 1027, Workers Paid is the first paid add-on to propose.

Moved to implementation: signed-in Feed in the real shell, checked in local dev with mobile
emulation. Real touch stays unverified.

Left to decide: Tiptap's device gate can't be passed, see
[Memory description format](13-memory-description-format.md).

## Comments

"Canvas JPEGs carry no metadata" is false on WebKit: probed `canvas.toBlob` on macOS 26, every JPEG
has APP1 Exif and APP13. Browser now strips them, so the Worker rule holds. See
[Write the spec](21-write-the-spec.md).
