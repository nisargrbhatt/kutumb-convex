import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { PostBase } from "@/domain/feed";
import { cn } from "@/lib/utils";
import { postLikersQuery, useSetLike } from "@/queries/feed";
import { useOrgId } from "@/queries/mutation";
import { AuthorAvatar, AuthorName } from "./AuthorLine";

const likesLabel = (n: number) => `${n} ${n === 1 ? "like" : "likes"}`;

/**
 * Heart and count, two targets: the heart toggles (optimistic, desired state), the count opens
 * who liked.
 */
export function LikeAction({ post }: { post: PostBase }) {
	const [open, setOpen] = useState(false);
	const setLike = useSetLike(post.id);
	const { count, viewerLiked } = post.likes;

	return (
		<div className="flex items-center">
			<Button
				variant="ghost"
				size="icon"
				aria-pressed={viewerLiked}
				aria-label={viewerLiked ? "Unlike" : "Like"}
				onClick={() => setLike.mutate(!viewerLiked)}
			>
				<Heart className={cn(viewerLiked && "fill-red-500 text-red-500")} />
			</Button>
			<Button
				variant="ghost"
				size="sm"
				className="min-w-8 px-2 tabular-nums"
				aria-label={`${likesLabel(count)}, show who liked`}
				disabled={count === 0}
				onClick={() => setOpen(true)}
			>
				{count}
			</Button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="flex max-h-[80dvh] flex-col gap-4">
					<DialogHeader>
						<DialogTitle>Liked by</DialogTitle>
						<DialogDescription>{likesLabel(count)}</DialogDescription>
					</DialogHeader>
					{open ? <Likers postId={post.id} /> : null}
				</DialogContent>
			</Dialog>
		</div>
	);
}

/** Mounted only while the Dialog is open, so likers are fetched on tap only. */
function Likers({ postId }: { postId: string }) {
	const orgId = useOrgId();
	const query = useInfiniteQuery(postLikersQuery(orgId, postId));
	const likers = query.data?.pages.flatMap((p) => p.likers) ?? [];

	if (query.isPending)
		return (
			<div className="flex flex-col gap-3">
				{[0, 1, 2].map((i) => (
					<div key={i} className="flex items-center gap-3">
						<Skeleton className="size-8 rounded-full" />
						<Skeleton className="h-4 w-32" />
					</div>
				))}
			</div>
		);
	if (query.isError)
		return <p className="text-sm text-muted-foreground">Couldn't load who liked this.</p>;

	return (
		<div className="-mx-2 flex min-h-0 flex-col gap-1 overflow-y-auto px-2">
			<ul className="flex flex-col gap-1">
				{likers.map((l) => (
					<li key={l.id} className="flex min-w-0 items-center gap-3 py-1">
						<AuthorAvatar author={l.author} className="size-8 shrink-0" />
						<AuthorName author={l.author} className="truncate text-sm font-medium" />
					</li>
				))}
			</ul>
			{likers.length === 0 ? <p className="text-sm text-muted-foreground">No likes yet.</p> : null}
			{query.hasNextPage ? (
				<Button
					variant="outline"
					size="sm"
					className="mt-2 self-center"
					disabled={query.isFetchingNextPage}
					onClick={() => query.fetchNextPage()}
				>
					{query.isFetchingNextPage ? "Loading…" : "Show more"}
				</Button>
			) : null}
		</div>
	);
}
