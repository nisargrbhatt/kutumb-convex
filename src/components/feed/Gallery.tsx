import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Download, Film, ImageOff, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Carousel,
	CarouselContent,
	CarouselItem,
	type CarouselApi,
} from "@/components/ui/carousel";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { BLOB_MEDIA_KIND } from "@/db/constants";
import { blobUrl } from "@/domain/blob";
import type { GalleryItem } from "@/domain/feed";
import {
	formatDuration,
	mediaLabel,
	mosaicLayout,
	singleRatio,
	videoDownloadName,
} from "@/domain/gallery";
import { useOrgId } from "@/queries/mutation";
import { cn } from "@/lib/utils";

/**
 * Memory gallery (spec: Feed UI > Card, Lightbox, Video): mosaic for 1 to 5 with ratios from the
 * Blob's `width` / `height`, tap opens a full-screen lightbox. A failed image shows a placeholder.
 * Video plays in the lightbox only, on the current slide only.
 */

const isVideo = (m: Pick<GalleryItem, "mediaKind">) => m.mediaKind === BLOB_MEDIA_KIND.memoryVideo;

/** One image, or a placeholder once it fails to load. `src` null: placeholder at once. */
export function MediaImage({
	src,
	label,
	fit = "cover",
	className,
}: {
	src: string | null;
	label: string;
	fit?: "cover" | "contain";
	className?: string;
}) {
	const [failed, setFailed] = useState(false);
	useEffect(() => setFailed(false), [src]);
	if (!src || failed) {
		return (
			<span
				role="img"
				aria-label={`${label} (couldn't load)`}
				className={cn(
					"flex size-full flex-col items-center justify-center gap-1 bg-muted text-muted-foreground",
					className
				)}
			>
				<ImageOff className="size-6" aria-hidden />
				<span className="text-xs">Couldn't load</span>
			</span>
		);
	}
	return (
		<img
			src={src}
			alt={label}
			loading="lazy"
			decoding="async"
			onError={() => setFailed(true)}
			className={cn("size-full", fit === "cover" ? "object-cover" : "object-contain", className)}
		/>
	);
}

/** Video with no poster: a neutral tile, never an error. */
export function VideoPlaceholder({ label, className }: { label: string; className?: string }) {
	return (
		<span
			role="img"
			aria-label={label}
			className={cn(
				"flex size-full items-center justify-center bg-muted text-muted-foreground",
				className
			)}
		>
			<Film className="size-8" aria-hidden />
		</span>
	);
}

/** Poster image, or the placeholder tile. Never touches the `video` variant. */
function VideoStill({
	item,
	label,
	fit = "cover",
	className,
}: {
	item: GalleryItem;
	label: string;
	fit?: "cover" | "contain";
	className?: string;
}) {
	const orgId = useOrgId();
	if (!item.hasPoster) return <VideoPlaceholder label={label} className={className} />;
	return (
		<MediaImage
			src={blobUrl(orgId, item.blobId, "poster")}
			label={label}
			fit={fit}
			className={className}
		/>
	);
}

/** Play badge plus duration over a video tile. */
function VideoBadge({ durationMs, big = false }: { durationMs: number | null; big?: boolean }) {
	return (
		<span className="pointer-events-none absolute inset-0 flex items-center justify-center">
			<span
				className={cn(
					"flex items-center justify-center rounded-full bg-black/55 text-white",
					big ? "size-16" : "size-11"
				)}
			>
				<Play className={cn("fill-current", big ? "size-7" : "size-5")} aria-hidden />
			</span>
			{durationMs !== null ? (
				<span className="absolute right-1.5 bottom-1.5 rounded bg-black/65 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums">
					{formatDuration(durationMs)}
				</span>
			) : null}
		</span>
	);
}

function Tile({
	item,
	src,
	label,
	className,
	onOpen,
}: {
	item: GalleryItem;
	src: string;
	label: string;
	className?: string;
	onOpen: () => void;
}) {
	return (
		<button
			type="button"
			aria-label={`Open ${label}`}
			className={cn(
				"relative block size-full min-h-0 min-w-0 cursor-zoom-in overflow-hidden bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
				className
			)}
			onClick={onOpen}
		>
			{isVideo(item) ? (
				<>
					<VideoStill item={item} label={label} />
					<VideoBadge durationMs={item.durationMs} />
				</>
			) : (
				<MediaImage src={src} label={label} />
			)}
		</button>
	);
}

function Mosaic({
	media,
	title,
	onOpen,
}: {
	media: GalleryItem[];
	title: string;
	onOpen: (index: number) => void;
}) {
	const orgId = useOrgId();
	const n = media.length;
	const label = (i: number) => mediaLabel(media[i]!.mediaKind, i, n, title);
	const src = (m: GalleryItem) => blobUrl(orgId, m.blobId, n === 1 ? "display" : "thumb");
	if (n === 1) {
		const m = media[0]!;
		return (
			<div className="overflow-hidden rounded-lg" style={{ aspectRatio: singleRatio(m) }}>
				<Tile item={m} src={src(m)} label={label(0)} onOpen={() => onOpen(0)} />
			</div>
		);
	}
	const layout = mosaicLayout(n);
	if (!layout) return null;
	return (
		<div className={cn("grid w-full gap-0.5 overflow-hidden rounded-lg", layout.box)}>
			{media.map((m, i) => (
				<Tile
					key={m.blobId}
					item={m}
					src={src(m)}
					label={label(i)}
					className={layout.tiles[i]}
					onOpen={() => onOpen(i)}
				/>
			))}
		</div>
	);
}

export const VIDEO_FAILED = "This video can't play in this browser.";

/**
 * The current slide's player. Mounted on the current slide only, so leaving unmounts it (stops the
 * download) and coming back restarts at 0. `preload="none"`: nothing downloads before play.
 * Failure is the `error` event, or metadata with `videoWidth === 0`; no `canPlayType` pre-check.
 */
function VideoPlayer({
	item,
	index,
	label,
	title,
	onStarted,
}: {
	item: GalleryItem;
	index: number;
	label: string;
	title: string;
	onStarted: () => void;
}) {
	const orgId = useOrgId();
	const [failed, setFailed] = useState(false);
	if (failed) {
		return (
			<Stage>
				<VideoStill item={item} label={label} fit="contain" className="bg-black" />
				<div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 bg-gradient-to-t from-black/90 to-transparent px-4 pt-10 pb-6 text-center">
					<p role="alert" className="text-sm">
						{VIDEO_FAILED}
					</p>
					<a
						href={blobUrl(orgId, item.blobId, "video", { download: true })}
						download={videoDownloadName(title, index, item.contentType)}
						className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					>
						<Download className="size-4" aria-hidden />
						Download video
					</a>
				</div>
			</Stage>
		);
	}
	return (
		<Stage>
			<video
				src={blobUrl(orgId, item.blobId, "video")}
				poster={item.hasPoster ? blobUrl(orgId, item.blobId, "poster") : undefined}
				aria-label={label}
				controls
				playsInline
				preload="none"
				className="size-full bg-black object-contain"
				onPlay={onStarted}
				onError={() => setFailed(true)}
				onLoadedMetadata={(e) => {
					if (e.currentTarget.videoWidth === 0) setFailed(true);
				}}
			/>
		</Stage>
	);
}

const Stage = ({ children }: { children: ReactNode }) => (
	<div className="relative size-full">{children}</div>
);

/** Full screen, swipe, counter; previous, next and close visible at every width. */
function Lightbox({
	media,
	title,
	index,
	onClose,
}: {
	media: GalleryItem[];
	title: string;
	index: number | null;
	onClose: () => void;
}) {
	const orgId = useOrgId();
	const [api, setApi] = useState<CarouselApi>();
	const [current, setCurrent] = useState(index ?? 0);
	// Once a video starts, swipe is off on that slide so scrubbing can't turn the page. A ref read
	// by `watchDrag`, so locking never re-inits the carousel.
	const dragLocked = useRef(false);
	const opts = useMemo(
		() => ({ startIndex: index ?? 0, watchDrag: () => !dragLocked.current }),
		[index]
	);
	useEffect(() => {
		if (!api) return;
		const on = () => {
			dragLocked.current = false;
			setCurrent(api.selectedScrollSnap());
		};
		on();
		api.on("select", on);
		return () => void api.off("select", on);
	}, [api]);
	useEffect(() => {
		dragLocked.current = false;
		if (index !== null) setCurrent(index);
	}, [index]);
	const n = media.length;
	const navClass =
		"absolute top-1/2 -translate-y-1/2 bg-black/40 text-white hover:bg-white/20 hover:text-white disabled:opacity-30";

	return (
		<Dialog open={index !== null} onOpenChange={(open) => !open && onClose()}>
			<DialogContent
				showCloseButton={false}
				className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-black p-0 text-white ring-0 sm:max-w-none"
				onKeyDown={(e) => {
					// Arrow keys on a focused player seek; they don't turn the page.
					if (e.target instanceof HTMLVideoElement) return;
					if (e.key === "ArrowLeft") api?.scrollPrev();
					if (e.key === "ArrowRight") api?.scrollNext();
				}}
			>
				<DialogTitle className="sr-only">{title}</DialogTitle>
				<div className="flex items-center justify-between gap-2 p-2">
					<span className="min-w-0 truncate pl-2 text-sm tabular-nums" aria-live="polite">
						{current + 1} / {n} · {title}
					</span>
					<Button
						variant="ghost"
						size="icon"
						aria-label="Close"
						className="shrink-0 text-white hover:bg-white/10 hover:text-white"
						onClick={onClose}
					>
						<X />
					</Button>
				</div>
				{index !== null ? (
					<Carousel
						setApi={setApi}
						opts={opts}
						className="relative min-h-0 flex-1"
						aria-label={`Media in ${title}`}
					>
						<CarouselContent className="ml-0 h-[calc(100dvh-3.5rem)]">
							{media.map((m, i) => {
								const label = mediaLabel(m.mediaKind, i, n, title);
								return (
									<CarouselItem key={m.blobId} className="pl-0">
										{!isVideo(m) ? (
											<MediaImage
												src={blobUrl(orgId, m.blobId, "display")}
												label={label}
												fit="contain"
												className="bg-black"
											/>
										) : i === current ? (
											<VideoPlayer
												item={m}
												index={i}
												label={label}
												title={title}
												onStarted={() => {
													dragLocked.current = true;
												}}
											/>
										) : (
											<Stage>
												<VideoStill item={m} label={label} fit="contain" className="bg-black" />
												<VideoBadge durationMs={m.durationMs} big />
											</Stage>
										)}
									</CarouselItem>
								);
							})}
						</CarouselContent>
						{n > 1 ? (
							<>
								<Button
									variant="ghost"
									size="icon-lg"
									aria-label="Previous"
									disabled={current === 0}
									className={cn(navClass, "left-2")}
									onClick={() => api?.scrollPrev()}
								>
									<ChevronLeft />
								</Button>
								<Button
									variant="ghost"
									size="icon-lg"
									aria-label="Next"
									disabled={current === n - 1}
									className={cn(navClass, "right-2")}
									onClick={() => api?.scrollNext()}
								>
									<ChevronRight />
								</Button>
							</>
						) : null}
					</Carousel>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

/** Mosaic plus its lightbox. Zero media: no block. */
export function MemoryGallery({ media, title }: { media: GalleryItem[]; title: string }) {
	const [open, setOpen] = useState<number | null>(null);
	if (media.length === 0) return null;
	return (
		<>
			<Mosaic media={media} title={title} onOpen={setOpen} />
			<Lightbox media={media} title={title} index={open} onClose={() => setOpen(null)} />
		</>
	);
}
