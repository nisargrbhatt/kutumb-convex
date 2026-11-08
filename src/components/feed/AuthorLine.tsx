import { Link } from "@tanstack/react-router";
import { format, formatDistanceToNow } from "date-fns";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { AuthorDisplay, PostBase } from "@/domain/feed";
import { cn } from "@/lib/utils";

/** Initials avatar. Snapshot authors never get a photo. */
export function AuthorAvatar({ author, className }: { author: AuthorDisplay; className?: string }) {
	return (
		<Avatar className={className}>
			<AvatarFallback className="font-medium">{author.initials}</AvatarFallback>
		</Avatar>
	);
}

/** Profile link when the viewer can see the profile; snapshot authors get plain text. */
export function AuthorName({ author, className }: { author: AuthorDisplay; className?: string }) {
	if (!author.profileId) return <span className={className}>{author.name}</span>;
	return (
		<Link
			to="/members/$id"
			params={{ id: author.profileId }}
			className={cn("hover:underline", className)}
		>
			{author.name}
		</Link>
	);
}

const fullDate = (d: Date) => format(d, "d MMM yyyy, HH:mm");

/** Avatar, name, time and "· edited". */
export function AuthorLine({ post, className }: { post: PostBase; className?: string }) {
	return (
		<div className={cn("flex min-w-0 items-center gap-2", className)}>
			<AuthorAvatar author={post.author} className="size-9 shrink-0" />
			<div className="flex min-w-0 flex-col">
				<AuthorName author={post.author} className="truncate text-sm font-medium" />
				<span className="text-xs text-muted-foreground">
					<time
						dateTime={post.createdAt.toISOString()}
						title={fullDate(post.createdAt)}
						suppressHydrationWarning
					>
						{formatDistanceToNow(post.createdAt, { addSuffix: true })}
					</time>
					{post.editedAt ? (
						<span title={`Edited ${fullDate(post.editedAt)}`}> · edited</span>
					) : null}
				</span>
			</div>
		</div>
	);
}
