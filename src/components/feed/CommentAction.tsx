import { Link } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import type { PostBase } from "@/domain/feed";
import { cn } from "@/lib/utils";

/** Hash the comment button links to; the detail page's composer takes focus when present. */
export const COMPOSER_HASH = "comment";

const commentsLabel = (n: number) => `${n} ${n === 1 ? "comment" : "comments"}`;

/** Comment count on a card: opens the detail page and focuses the composer. */
export function CommentAction({ post }: { post: PostBase }) {
	return (
		<Link
			to="/feed/$postId"
			params={{ postId: post.id }}
			hash={COMPOSER_HASH}
			aria-label={`${commentsLabel(post.commentCount)}, add a comment`}
			className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5 px-2 tabular-nums")}
		>
			<MessageCircle />
			{post.commentCount}
		</Link>
	);
}
