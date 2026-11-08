import { useRef, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { blobUrl } from "@/domain/blob";
import { GALLERY_MAX } from "@/domain/limits";
import { BLOB_MEDIA_KIND } from "@/db/constants";
import { PHOTO_ACCEPT } from "@/domain/photo";
import { VIDEO_ACCEPT } from "@/domain/video";
import type { DraftItem, GalleryDraft } from "@/lib/galleryDraft";
import { cn } from "@/lib/utils";
import { useOrgId } from "@/queries/mutation";
import { MediaImage, VideoPlaceholder } from "./Gallery";

/**
 * Drawer gallery grid (spec: Feed UI > Create and edit Drawer): per-file progress and inline error,
 * earlier / later arrows, remove. State lives in the `GalleryDraft`.
 */

function Thumb({ item }: { item: DraftItem }) {
	const orgId = useOrgId();
	if (item.state === "attached") {
		if (item.mediaKind === BLOB_MEDIA_KIND.memoryVideo) {
			return item.hasPoster ? (
				<MediaImage src={blobUrl(orgId, item.blobId, "poster")} label={item.name} />
			) : (
				<VideoPlaceholder label={item.name} />
			);
		}
		return <MediaImage src={blobUrl(orgId, item.blobId, "thumb")} label={item.name} />;
	}
	if (item.state === "uploaded") {
		return item.previewUrl ? (
			<MediaImage src={item.previewUrl} label={item.name} />
		) : (
			<VideoPlaceholder label={item.name} />
		);
	}
	if (item.state === "uploading") {
		return (
			<span className="flex size-full items-center justify-center bg-muted text-muted-foreground">
				<Spinner />
				<span className="sr-only">Uploading {item.name}</span>
			</span>
		);
	}
	return <MediaImage src={null} label={item.name} />;
}

export function GalleryField({ draft, error }: { draft: GalleryDraft; error?: string | null }) {
	const items = useSyncExternalStore(draft.subscribe, draft.items, draft.items);
	const input = useRef<HTMLInputElement>(null);
	const room = GALLERY_MAX - items.length;

	return (
		<div className="flex flex-col gap-2">
			<ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Photos and videos">
				{items.map((d, i) => (
					<li key={d.key} className="flex min-w-0 flex-col gap-1">
						<div
							className={cn(
								"relative aspect-square w-full overflow-hidden rounded-lg",
								d.state === "error" && "ring-2 ring-destructive"
							)}
						>
							<Thumb item={d} />
							<div className="absolute top-1 right-1 flex gap-0.5">
								<Button
									type="button"
									variant="secondary"
									size="icon-xs"
									aria-label={`Move ${d.name} earlier`}
									disabled={i === 0}
									onClick={() => draft.move(d.key, -1)}
								>
									<ChevronLeft />
								</Button>
								<Button
									type="button"
									variant="secondary"
									size="icon-xs"
									aria-label={`Move ${d.name} later`}
									disabled={i === items.length - 1}
									onClick={() => draft.move(d.key, 1)}
								>
									<ChevronRight />
								</Button>
								<Button
									type="button"
									variant="secondary"
									size="icon-xs"
									aria-label={`Remove ${d.name}`}
									onClick={() => draft.remove(d.key)}
								>
									<X />
								</Button>
							</div>
							{d.state === "uploading" ? (
								<Progress
									value={Math.round(d.progress * 100)}
									aria-label={`Uploading ${d.name}`}
									className="absolute inset-x-1 bottom-1 w-auto"
								/>
							) : null}
						</div>
						<p className="truncate text-xs text-muted-foreground" title={d.name}>
							{d.name}
						</p>
						{d.state === "error" ? (
							<p role="alert" className="text-xs text-destructive">
								{d.error}
							</p>
						) : null}
					</li>
				))}
				{room > 0 ? (
					<li>
						<button
							type="button"
							className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-sm text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
							onClick={() => input.current?.click()}
						>
							<ImagePlus className="size-5" aria-hidden />
							Add photos or videos
						</button>
					</li>
				) : null}
			</ul>
			<p className="text-sm text-muted-foreground">
				{items.length} of {GALLERY_MAX} photos or videos. Optional.
			</p>
			{error ? (
				<p role="alert" className="text-sm text-destructive">
					{error}
				</p>
			) : null}
			<input
				ref={input}
				type="file"
				multiple
				hidden
				accept={`${PHOTO_ACCEPT},${VIDEO_ACCEPT}`}
				onChange={(e) => {
					const files = Array.from(e.target.files ?? []);
					e.target.value = "";
					const left = draft.add(files);
					if (left > 0) {
						toast.error(`Up to ${GALLERY_MAX} photos or videos`, {
							description: `${left} ${left === 1 ? "file was" : "files were"} left out.`,
						});
					}
				}}
			/>
		</div>
	);
}
