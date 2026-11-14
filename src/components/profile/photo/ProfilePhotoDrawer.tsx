import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import Cropper from "react-easy-crop";
import type { Area, MediaSize, Point } from "react-easy-crop";
import { ImageUpIcon, RotateCcwIcon, RotateCwIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fullName, initials } from "@/domain/communityProfile";
import { PHOTO_ACCEPT, PHOTO_COPY } from "@/domain/photo";
import { clampCrop, cropSide, minZoomForAngle } from "@/domain/photoCrop";
import {
	PhotoError,
	decodePhoto,
	exportProfilePhoto,
	releasePhoto,
	renderCrop,
	type DecodedPhoto,
} from "@/lib/photo";

const MAX_ZOOM = 4;
const PREVIEW_EDGE = 240;

type NamedProfile = Parameters<typeof fullName>[0];

type View = { crop: Point; zoom: number; quarter: number; straighten: number };
const START: View = { crop: { x: 0, y: 0 }, zoom: 1, quarter: 0, straighten: 0 };
const rotationOf = (v: View) => v.quarter + v.straighten;

/** Zoom raised to the angle's minimum and the offset kept on the photo (no white wedges). */
function settle(v: View, media: MediaSize | null): View {
	const rotation = rotationOf(v);
	const zoom = Math.min(Math.max(v.zoom, minZoomForAngle(rotation)), MAX_ZOOM);
	const crop = media ? clampCrop(v.crop, { media, zoom, rotation }) : v.crop;
	return { ...v, zoom, crop };
}

const sliderValue = (v: number | readonly number[]) =>
	(Array.isArray(v) ? (v[0] ?? 0) : v) as number;

/**
 * Crop editor in a wide right-side Drawer (spec: Profile Photo > Crop editor): square crop with
 * thirds, Zoom and Straighten sliders plus 90° turns, live "Where it shows" previews. `onSave`
 * gets the stripped `avatar` + `display` JPEGs and an abort signal that fires if the Drawer closes.
 */
export function ProfilePhotoDrawer({
	open,
	onOpenChange,
	profile,
	onSave,
	saveLabel = "Save photo",
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	profile: NamedProfile;
	onSave: (variants: { avatar: Blob; display: Blob }, signal: AbortSignal) => Promise<unknown>;
	/** Footer button: "Send for review" when the save files a `photo` Change Request. */
	saveLabel?: string;
}) {
	const inputRef = useRef<HTMLInputElement | null>(null);
	const [photo, setPhoto] = useState<DecodedPhoto | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [decoding, setDecoding] = useState(false);
	const [saving, setSaving] = useState(false);
	const [view, setView] = useState<View>(START);
	const [media, setMedia] = useState<MediaSize | null>(null);
	const [area, setArea] = useState<Area | null>(null);
	const [liveArea, setLiveArea] = useState<Area | null>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const abortRef = useRef<AbortController | null>(null);
	const pickRef = useRef(0);

	const rotation = rotationOf(view);
	const minZoom = minZoomForAngle(rotation);

	const clear = useCallback(() => {
		setPhoto((p) => {
			releasePhoto(p);
			return null;
		});
		setError(null);
		setView(START);
		setMedia(null);
		setArea(null);
		setLiveArea(null);
		setPreviewUrl(null);
	}, []);

	// Drawer closed any way (Cancel, X, Esc, overlay): stop a running upload, drop the editor.
	const handleOpenChange = (next: boolean) => {
		if (!next) {
			abortRef.current?.abort();
			abortRef.current = null;
			pickRef.current++;
			clear();
			setSaving(false);
			setDecoding(false);
		}
		onOpenChange(next);
	};

	useEffect(() => () => abortRef.current?.abort(), []);
	// Stage measured (or resized): re-settle against the real photo size.
	useEffect(() => setView((v) => settle(v, media)), [media]);

	async function pick(file: File) {
		const ticket = ++pickRef.current;
		clear();
		setDecoding(true);
		try {
			const decoded = await decodePhoto(file);
			if (ticket !== pickRef.current) return releasePhoto(decoded);
			setPhoto(decoded);
		} catch (e) {
			if (ticket === pickRef.current) {
				setError(e instanceof PhotoError ? e.message : PHOTO_COPY.unreadable);
			}
		} finally {
			if (ticket === pickRef.current) setDecoding(false);
		}
	}

	// Live previews from the 512 px copy, once per frame.
	useEffect(() => {
		if (!photo || !liveArea) return;
		const raf = requestAnimationFrame(() => {
			const s = photo.preview.width / photo.full.width;
			const scaled = {
				x: liveArea.x * s,
				y: liveArea.y * s,
				width: liveArea.width * s,
				height: liveArea.height * s,
			};
			setPreviewUrl(
				renderCrop(photo.preview, scaled, rotation, PREVIEW_EDGE).toDataURL("image/jpeg", 0.8)
			);
		});
		return () => cancelAnimationFrame(raf);
	}, [photo, liveArea, rotation]);

	const turn = (by: number) =>
		setView((v) => settle({ ...v, quarter: (v.quarter + by + 360) % 360 }, media));

	async function save() {
		if (!photo || !area) return;
		const controller = new AbortController();
		abortRef.current = controller;
		setSaving(true);
		setError(null);
		try {
			const variants = await exportProfilePhoto(photo, area, rotation);
			if (controller.signal.aborted) return;
			await onSave(variants, controller.signal);
			if (!controller.signal.aborted) handleOpenChange(false);
		} catch (e) {
			if (e instanceof PhotoError && !controller.signal.aborted) setError(e.message);
		} finally {
			if (abortRef.current === controller) {
				abortRef.current = null;
				setSaving(false);
			}
		}
	}

	const face = (className: string) => (
		<Avatar className={className}>
			{previewUrl ? <AvatarImage src={previewUrl} alt="" /> : null}
			<AvatarFallback>{initials(profile)}</AvatarFallback>
		</Avatar>
	);

	const side = media ? cropSide(media) : 0;

	return (
		<Sheet open={open} onOpenChange={handleOpenChange}>
			<SheetContent
				side="right"
				className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
			>
				<SheetHeader className="border-b pr-12">
					<SheetTitle>Profile photo</SheetTitle>
					<SheetDescription>Check how it looks everywhere before you save.</SheetDescription>
				</SheetHeader>

				<div className="grid min-h-0 flex-1 auto-rows-min gap-4 overflow-y-auto p-4 sm:grid-cols-[minmax(0,1fr)_14rem] sm:p-6">
					<input
						ref={inputRef}
						type="file"
						accept={PHOTO_ACCEPT}
						className="sr-only"
						tabIndex={-1}
						aria-label="Choose photo"
						onChange={(e: ChangeEvent<HTMLInputElement>) => {
							const f = e.target.files?.[0];
							e.target.value = "";
							if (f) void pick(f);
						}}
					/>
					<div className="flex min-w-0 flex-col gap-3">
						<div className="relative aspect-square w-full touch-none overflow-hidden rounded-lg bg-zinc-900">
							{photo ? (
								<Cropper
									image={photo.url}
									crop={view.crop}
									zoom={view.zoom}
									rotation={rotation}
									aspect={1}
									minZoom={minZoom}
									maxZoom={MAX_ZOOM}
									cropShape="rect"
									showGrid
									restrictPosition={false}
									cropSize={side ? { width: side, height: side } : undefined}
									setMediaSize={(m) =>
										setMedia((prev) =>
											prev && prev.width === m.width && prev.height === m.height ? prev : { ...m }
										)
									}
									onCropChange={(c) => setView((v) => settle({ ...v, crop: c }, media))}
									onZoomChange={(z) => setView((v) => settle({ ...v, zoom: z }, media))}
									onCropAreaChange={(_, px) => setLiveArea(px)}
									onCropComplete={(_, px) => setArea(px)}
									mediaProps={{ alt: "" }}
									cropperProps={{
										"aria-label": "Crop area. Drag, or use the arrow keys, to move the photo.",
									}}
								/>
							) : (
								<button
									type="button"
									onClick={() => inputRef.current?.click()}
									disabled={decoding}
									className="flex size-full flex-col items-center justify-center gap-2 text-sm text-zinc-300 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
								>
									{decoding ? <Spinner /> : <ImageUpIcon className="size-6" />}
									{decoding ? "Opening photo…" : "Choose a photo"}
								</button>
							)}
						</div>
						{error ? (
							<p role="alert" className="text-sm text-destructive">
								{error}
							</p>
						) : null}
						{photo ? (
							<Tabs defaultValue="zoom">
								<TabsList className="w-full">
									<TabsTrigger value="zoom">Zoom</TabsTrigger>
									<TabsTrigger value="straighten">Straighten</TabsTrigger>
								</TabsList>
								<TabsContent value="zoom" className="pt-3">
									<Slider
										aria-label="Zoom"
										min={minZoom}
										max={MAX_ZOOM}
										step={0.01}
										value={[view.zoom]}
										onValueChange={(v) =>
											setView((cur) => settle({ ...cur, zoom: sliderValue(v) }, media))
										}
									/>
								</TabsContent>
								<TabsContent value="straighten" className="flex items-center gap-2 pt-3">
									<Button
										variant="outline"
										size="icon-sm"
										aria-label="Rotate left 90 degrees"
										onClick={() => turn(-90)}
									>
										<RotateCcwIcon />
									</Button>
									<Slider
										aria-label="Straighten"
										min={-45}
										max={45}
										step={1}
										value={[view.straighten]}
										onValueChange={(v) =>
											setView((cur) => settle({ ...cur, straighten: sliderValue(v) }, media))
										}
									/>
									<Button
										variant="outline"
										size="icon-sm"
										aria-label="Rotate right 90 degrees"
										onClick={() => turn(90)}
									>
										<RotateCwIcon />
									</Button>
								</TabsContent>
							</Tabs>
						) : null}
					</div>

					<div className="flex min-w-0 flex-col gap-3 text-sm">
						<p className="font-medium">Where it shows</p>
						<div className="flex items-center gap-2 rounded-md border p-2">
							{face("size-8")}
							<span className="min-w-0 truncate">{fullName(profile)}</span>
						</div>
						<div className="flex items-center gap-3 rounded-md border p-2">
							{face("size-16 sm:size-20")}
							<span className="text-xs text-muted-foreground">Profile header</span>
						</div>
						<div className="flex flex-col items-center gap-1 rounded-md border p-2">
							{face("size-12")}
							<span className="text-xs text-muted-foreground">Community tree</span>
						</div>
						<div className="flex flex-col gap-1 rounded-md border p-2">
							{previewUrl ? (
								<img
									src={previewUrl}
									alt=""
									className="aspect-square w-full rounded object-cover"
								/>
							) : (
								<div className="aspect-square w-full rounded bg-muted" />
							)}
							<span className="text-xs text-muted-foreground">Full view, square</span>
						</div>
					</div>
				</div>

				<SheetFooter className="mt-0 flex-row flex-wrap justify-between border-t bg-popover">
					<Button
						variant="ghost"
						disabled={!photo || saving}
						onClick={() => inputRef.current?.click()}
					>
						Choose another
					</Button>
					<div className="flex gap-2">
						<Button variant="outline" onClick={() => handleOpenChange(false)}>
							Cancel
						</Button>
						<Button disabled={!photo || !area || saving} onClick={() => void save()}>
							{saving ? <Spinner /> : null}
							{saveLabel}
						</Button>
					</div>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
