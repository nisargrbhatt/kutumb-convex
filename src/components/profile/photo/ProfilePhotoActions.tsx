import { lazy, Suspense, useState } from "react";
import { CameraIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { fullName } from "@/domain/communityProfile";
import { useSetMyProfilePhoto } from "@/queries/communityProfile";

// Crop library + canvas pipeline load only when the editor opens.
const ProfilePhotoDrawer = lazy(() =>
	import("./ProfilePhotoDrawer").then((m) => ({ default: m.ProfilePhotoDrawer }))
);

/**
 * "Add photo" / "Edit photo" plus Remove (confirm Dialog, no reason). `edit`: own linked profile, or
 * a Userless Profile the Actor edits directly. `remove`: owner/admin on someone's linked profile.
 */
export function ProfilePhotoActions({
	profile,
	mode = "edit",
	own = true,
}: {
	profile: Parameters<typeof fullName>[0] & { id: string; photoBlobId: string | null };
	mode?: "edit" | "remove";
	/** Copy only: "Your initials" vs "Initials". */
	own?: boolean;
}) {
	const [open, setOpen] = useState(false);
	// Mounted from the first open on, so the Drawer can animate closed.
	const [opened, setOpened] = useState(false);
	const [confirm, setConfirm] = useState(false);
	const mutation = useSetMyProfilePhoto();
	const hasPhoto = profile.photoBlobId !== null;

	return (
		<>
			{mode === "edit" ? (
				<Button
					variant="outline"
					onClick={() => {
						setOpened(true);
						setOpen(true);
					}}
				>
					<CameraIcon />
					{hasPhoto ? "Edit photo" : "Add photo"}
				</Button>
			) : null}
			{hasPhoto ? (
				<Button
					variant="outline"
					size="icon"
					aria-label="Remove photo"
					onClick={() => setConfirm(true)}
				>
					<Trash2Icon />
				</Button>
			) : null}

			{opened && mode === "edit" ? (
				<Suspense fallback={null}>
					<ProfilePhotoDrawer
						open={open}
						onOpenChange={setOpen}
						profile={profile}
						onSave={(variants, signal) =>
							mutation.mutateAsync({ profileId: profile.id, variants, signal })
						}
					/>
				</Suspense>
			) : null}

			<ConfirmDialog
				open={confirm}
				onOpenChange={setConfirm}
				title="Remove profile photo?"
				description={own ? "Your initials will show instead." : "Initials will show instead."}
				confirmLabel="Remove"
				destructive
				isPending={mutation.isPending}
				onConfirm={() =>
					mutation.mutate({ profileId: profile.id }, { onSuccess: () => setConfirm(false) })
				}
			/>
		</>
	);
}
