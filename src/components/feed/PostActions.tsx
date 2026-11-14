import { Suspense, lazy, useState, type ComponentType, type LazyExoticComponent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { EllipsisVertical, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PostKind } from "@/db/constants";
import type { PostBase } from "@/domain/feed";
import { postActions } from "@/domain/feedPolicy";
import { useActor } from "@/hooks/useActor";
import { useRemovePost } from "@/queries/feed";

type EditDrawer = ComponentType<{
	open: boolean;
	onOpenChange: (open: boolean) => void;
	postId: string;
}>;

/** Each kind's edit Drawer, loaded on first Edit. A new `PostKind` fails to compile until listed. */
const EDIT_DRAWERS: Record<PostKind, LazyExoticComponent<EditDrawer>> = {
	memory: lazy(() => import("./MemoryDrawer")),
};

/**
 * A Post's actions menu, beside the author line: Edit to the author, Remove to the author and
 * owner/admin (Feed policy). Nothing to show, no menu. On the detail page, removal returns to the
 * Feed.
 */
export function PostActions({
	post,
	detail = false,
}: {
	post: PostBase & { kind: PostKind };
	detail?: boolean;
}) {
	const actor = useActor();
	const allowed = postActions(actor, post);
	const [editOpen, setEditOpen] = useState(false);
	const [editLoaded, setEditLoaded] = useState(false);
	const [removeOpen, setRemoveOpen] = useState(false);
	const remove = useRemovePost();
	const navigate = useNavigate();

	if (!allowed.edit && !allowed.remove) return null;
	const Drawer = EDIT_DRAWERS[post.kind];

	const onRemove = () =>
		remove.mutate(post.id, {
			onSuccess: async () => {
				setRemoveOpen(false);
				if (detail) await navigate({ to: "/feed" });
				remove.forgetPost(post.id);
			},
		});

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button variant="ghost" size="icon-sm" className="shrink-0" aria-label="Post actions" />
					}
				>
					<EllipsisVertical />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					{allowed.edit ? (
						<DropdownMenuItem
							onClick={() => {
								setEditLoaded(true);
								setEditOpen(true);
							}}
						>
							<Pencil /> Edit
						</DropdownMenuItem>
					) : null}
					{allowed.remove ? (
						<DropdownMenuItem variant="destructive" onClick={() => setRemoveOpen(true)}>
							<Trash2 /> Remove
						</DropdownMenuItem>
					) : null}
				</DropdownMenuContent>
			</DropdownMenu>

			{allowed.remove ? (
				<ConfirmDialog
					open={removeOpen}
					onOpenChange={setRemoveOpen}
					title="Remove this post?"
					description="It's deleted for everyone, with its likes and comments. This can't be undone."
					confirmLabel="Remove"
					destructive
					onConfirm={onRemove}
					isPending={remove.isPending}
				/>
			) : null}

			{allowed.edit && editLoaded ? (
				<Suspense fallback={null}>
					<Drawer open={editOpen} onOpenChange={setEditOpen} postId={post.id} />
				</Suspense>
			) : null}
		</>
	);
}
