import { useEffect, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, ImageOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Carousel,
	CarouselContent,
	CarouselItem,
	type CarouselApi,
} from "@/components/ui/carousel";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { blobUrl } from "@/domain/blob";
import type { GalleryItem } from "@/domain/feed";
import { mediaLabel, mosaicLayout, singleRatio } from "@/domain/gallery";
import { useOrgId } from "@/queries/mutation";
import { cn } from "@/lib/utils";

/**
 * Memory gallery (spec: Feed UI > Card, Lightbox): mosaic for 1 to 5 with ratios from the Blob's
 * `width` / `height`, tap opens a full-screen lightbox. A failed image shows a placeholder.
 */

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

function Tile({
	src,
	label,
	className,
	style,
	onOpen,
}: {
	src: string;
	label: string;
	className?: string;
	style?: CSSProperties;
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
			style={style}
			onClick={onOpen}
		>
			<MediaImage src={src} label={label} />
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
				<Tile src={src(m)} label={label(0)} onOpen={() => onOpen(0)} />
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
					src={src(m)}
					label={label(i)}
					className={layout.tiles[i]}
					onOpen={() => onOpen(i)}
				/>
			))}
		</div>
	);
}

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
	useEffect(() => {
		if (!api) return;
		const on = () => setCurrent(api.selectedScrollSnap());
		on();
		api.on("select", on);
		return () => void api.off("select", on);
	}, [api]);
	useEffect(() => {
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
						opts={{ startIndex: index }}
						className="relative min-h-0 flex-1"
						aria-label={`Photos in ${title}`}
					>
						<CarouselContent className="ml-0 h-[calc(100dvh-3.5rem)]">
							{media.map((m, i) => (
								<CarouselItem key={m.blobId} className="pl-0">
									<MediaImage
										src={blobUrl(orgId, m.blobId, "display")}
										label={mediaLabel(m.mediaKind, i, n, title)}
										fit="contain"
										className="bg-black"
									/>
								</CarouselItem>
							))}
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
