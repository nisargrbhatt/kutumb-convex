import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import type { FeedPost } from "@/domain/feed";
import { AuthorLine } from "./AuthorLine";
import { DescriptionView } from "./DescriptionView";
import { ShareButton } from "./ShareButton";

/** Memory card: author line, title (opens detail), `descriptionText` at 3 lines. */
export function MemoryCard({ post }: { post: FeedPost<"card", "memory"> }) {
	return (
		<Card className="gap-3 py-4">
			<CardContent className="flex min-w-0 flex-col gap-3 px-4">
				<AuthorLine post={post} />
				<div className="flex min-w-0 flex-col gap-1">
					<Link
						to="/feed/$postId"
						params={{ postId: post.id }}
						className="text-base font-medium break-words hover:underline"
					>
						{post.data.title}
					</Link>
					{post.data.descriptionText ? (
						<p className="line-clamp-3 text-sm break-words text-muted-foreground">
							{post.data.descriptionText}
						</p>
					) : null}
				</div>
				<div className="flex items-center justify-end">
					<ShareButton postId={post.id} />
				</div>
			</CardContent>
		</Card>
	);
}

/** Memory detail: author line, title, full description. */
export function MemoryDetail({ post }: { post: FeedPost<"detail", "memory"> }) {
	return (
		<article className="flex min-w-0 flex-col gap-4">
			<AuthorLine post={post} />
			<h1 className="text-xl font-medium break-words">{post.data.title}</h1>
			{post.data.descriptionDoc ? <DescriptionView doc={post.data.descriptionDoc} /> : null}
			<div className="flex items-center justify-end">
				<ShareButton postId={post.id} />
			</div>
		</article>
	);
}
