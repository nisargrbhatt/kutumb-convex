# Video playback in the Feed

Type: grilling Status: resolved Blocked by:

## Question

How does video play on cards and in the lightbox? The prototype only shows a poster, play badge and
duration, and tapping opens the lightbox. Is that the rule, or do cards play inline, and does
anything autoplay or start muted? When does a clip start downloading, given data use on mobile? What
happens with no poster? See
[Feed card, gallery and detail page](15-feed-card-gallery-detail.md).

HEVC on browsers with no decoder belongs to
[HEIC on browsers that can't read it](16-heic-on-browsers-that-cant-read-it.md).

Any `<video>` error falls back to poster plus download link, and real iPhone playback stays
unverified: [Real device and plan checks](17-real-device-and-plan-checks.md).

## Answer

Video plays in the lightbox only, and nothing starts by itself.

- **Cards never play.** Tapping a video tile opens the lightbox, on cards and on the detail page.
- **No autoplay.** Lightbox shows the poster with native `controls`; the member presses play, sound
  on. No muted autoplay, no loop. Autoplay after the tile tap would rest on iOS gesture rules that
  can't be verified here.
- **Bytes move only on play.** `preload="none"`. `<video>` is mounted on the current slide only, with
  no neighbour prefetch. Leaving the slide or closing the lightbox unmounts it, which stops the
  download; coming back restarts at 0. No size warning or data-saver check.
- **Lightbox controls.** `playsinline`, native fullscreen stays available. Once a video has started,
  swipe is off on that slide so scrubbing can't turn the page. Previous and next buttons show at
  every width.
- **No poster.** Card shows the placeholder with play badge and duration. Lightbox still offers play:
  a missing poster only means the uploader's browser couldn't decode the clip.
- **Failure.** Either the `error` event, or `loadedmetadata` with `videoWidth === 0`, which covers a
  browser playing audio over black (from memory, unverified). No `canPlayType` pre-check. The slide
  then shows poster or placeholder, "This video can't play in this browser." and the download link.
  So failure only shows after pressing play.
- **Download link.** Shown on failure only. Same gated blob route with `?download=1`, which adds
  `Content-Disposition: attachment` with no filename. The anchor sets `download="<title>-2.mov"`, so
  the route needs no title lookup.
- **Blob gains `width`, `height`, `durationMs`.** Read by the Worker during verification, never taken
  from the client. Video size has `tkhd` rotation applied, so portrait iPhone clips keep their shape.
  Photos take size from the JPEG header. Tile and mosaic work with no poster.
