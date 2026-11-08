import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { zodResolver } from "@hookform/resolvers/zod";
import { formatDistanceToNow, format } from "date-fns";
import { Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { commentBody, type PostComment } from "@/domain/feed";
import { canRemoveComment } from "@/domain/feedPolicy";
import { COMMENT_MAX } from "@/domain/limits";
import { useActor } from "@/hooks/useActor";
import { postCommentsQuery, useCreateComment, useRemoveComment } from "@/queries/feed";
import { useOrgId } from "@/queries/mutation";
import { AuthorAvatar, AuthorName } from "./AuthorLine";
import { COMPOSER_HASH } from "./CommentAction";

const formSchema = z.object({ body: commentBody });
type FormValues = z.infer<typeof formSchema>;

/** Comments on `/feed/$postId`: composer above the list, newest first, 20 per page. */
export function Comments({ postId }: { postId: string }) {
	const orgId = useOrgId();
	const query = useInfiniteQuery(postCommentsQuery(orgId, postId));
	const comments = query.data?.pages.flatMap((p) => p.comments) ?? [];

	return (
		<section aria-labelledby="comments-heading" className="flex min-w-0 flex-col gap-4">
			<h2 id="comments-heading" className="text-base font-medium">
				Comments
			</h2>
			<Composer postId={postId} />
			{query.isPending ? (
				<div className="flex flex-col gap-4">
					{[0, 1, 2].map((i) => (
						<div key={i} className="flex gap-3">
							<Skeleton className="size-8 shrink-0 rounded-full" />
							<div className="flex flex-1 flex-col gap-2">
								<Skeleton className="h-4 w-32" />
								<Skeleton className="h-4 w-3/4" />
							</div>
						</div>
					))}
				</div>
			) : query.isError ? (
				<p className="text-sm text-muted-foreground">Couldn't load comments.</p>
			) : comments.length === 0 ? (
				<p className="text-sm text-muted-foreground">No comments yet.</p>
			) : (
				<ul className="flex min-w-0 flex-col gap-4">
					{comments.map((c) => (
						<CommentItem key={c.id} postId={postId} comment={c} />
					))}
				</ul>
			)}
			{query.hasNextPage ? (
				<Button
					variant="outline"
					size="sm"
					className="self-center"
					disabled={query.isFetchingNextPage}
					onClick={() => query.fetchNextPage()}
				>
					{query.isFetchingNextPage ? "Loading…" : "Show more"}
				</Button>
			) : null}
		</section>
	);
}

/** Waits for the server; the text stays in the box on failure. Focused when opened from a card. */
function Composer({ postId }: { postId: string }) {
	const create = useCreateComment(postId);
	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: { body: "" },
	});
	const textarea = useRef<HTMLTextAreaElement | null>(null);
	const hash = useLocation({ select: (l) => l.hash });

	useEffect(() => {
		if (hash === COMPOSER_HASH) textarea.current?.focus();
	}, [hash]);

	const onSubmit = async ({ body }: FormValues) => {
		try {
			await create.mutateAsync(body);
		} catch {
			return; // toast shown; text stays
		}
		form.reset({ body: "" });
	};

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-2">
				<FormField
					control={form.control}
					name="body"
					render={({ field: { ref, ...field } }) => (
						<FormItem>
							<FormLabel className="sr-only">Write a comment</FormLabel>
							<FormControl>
								<Textarea
									id={COMPOSER_HASH}
									rows={2}
									maxLength={COMMENT_MAX}
									placeholder="Write a comment…"
									className="min-h-20 text-base md:text-base"
									{...field}
									ref={(el) => {
										ref(el);
										textarea.current = el;
									}}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<Button type="submit" size="sm" className="self-end" disabled={create.isPending}>
					{create.isPending ? <Spinner /> : null}
					Comment
				</Button>
			</form>
		</Form>
	);
}

const fullDate = (d: Date) => format(d, "d MMM yyyy, HH:mm");

/** One comment: plain text, line breaks kept, no auto-links. Trash only where removal is allowed. */
function CommentItem({ postId, comment }: { postId: string; comment: PostComment }) {
	const actor = useActor();
	const [confirmOpen, setConfirmOpen] = useState(false);
	const remove = useRemoveComment(postId);
	const canRemove = canRemoveComment(actor, comment);

	return (
		<li className="flex min-w-0 gap-3">
			<AuthorAvatar author={comment.author} className="size-8 shrink-0" />
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<div className="flex min-w-0 items-start justify-between gap-2">
					<div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
						<AuthorName author={comment.author} className="truncate text-sm font-medium" />
						<time
							dateTime={comment.createdAt.toISOString()}
							title={fullDate(comment.createdAt)}
							className="text-xs text-muted-foreground"
							suppressHydrationWarning
						>
							{formatDistanceToNow(comment.createdAt, { addSuffix: true })}
						</time>
					</div>
					{canRemove ? (
						<Button
							variant="ghost"
							size="icon-sm"
							className="-mt-1 shrink-0"
							aria-label="Remove comment"
							onClick={() => setConfirmOpen(true)}
						>
							<Trash2 />
						</Button>
					) : null}
				</div>
				<p className="text-sm break-words whitespace-pre-wrap">{comment.body}</p>
			</div>
			{canRemove ? (
				<ConfirmDialog
					open={confirmOpen}
					onOpenChange={setConfirmOpen}
					title="Remove this comment?"
					description="It's deleted for everyone. This can't be undone."
					confirmLabel="Remove"
					destructive
					isPending={remove.isPending}
					onConfirm={() => remove.mutate(comment.id, { onSuccess: () => setConfirmOpen(false) })}
				/>
			) : null}
		</li>
	);
}
