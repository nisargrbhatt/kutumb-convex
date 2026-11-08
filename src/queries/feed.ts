import {
	type InfiniteData,
	infiniteQueryOptions,
	queryOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { usePostHog } from "@posthog/react";
import { toast } from "sonner";
import { isAppError } from "@/domain/errors";
import { type FeedPage, type FeedPost, type MemoryInput, withLike } from "@/domain/feed";
import {
	createMemory,
	getFeedPage,
	getFeedPost,
	getMemoryForEdit,
	getPostLikers,
	removePost,
	setLike,
	updateMemory,
} from "@/server/feed";
import { feedKeys } from "./keys";
import { toastMutationError, useOrgId } from "./mutation";

/** Feed, newest first, by `createdAt:id` cursor (page 10). No polling; own Post invalidates. */
export const feedQuery = (orgId: string) =>
	infiniteQueryOptions({
		queryKey: feedKeys.list(orgId),
		queryFn: ({ pageParam }) => getFeedPage({ data: { cursor: pageParam ?? undefined } }),
		initialPageParam: null as string | null,
		getNextPageParam: (last) => last.nextCursor,
	});

export const feedPostQuery = (orgId: string, postId: string) =>
	queryOptions({
		queryKey: feedKeys.post(orgId, postId),
		queryFn: () => getFeedPost({ data: { postId } }),
	});

/** Post a Memory; live at once, so the Feed refetches from the top. */
export function useCreateMemory() {
	const qc = useQueryClient();
	const orgId = useOrgId();
	const posthog = usePostHog();
	return useMutation({
		mutationFn: (data: MemoryInput) => createMemory({ data }),
		onSuccess: async () => {
			toast.success("Memory shared");
			posthog.capture("memory_posted");
			await qc.invalidateQueries({ queryKey: feedKeys.all(orgId) });
		},
		onError: toastMutationError("Memory", "Failed to share memory"),
	});
}

export type FeedPageData = Awaited<ReturnType<typeof getFeedPage>>;

/** Who liked, fetched only once the Dialog opens: newest first, 50 per page. */
export const postLikersQuery = (orgId: string, postId: string) =>
	infiniteQueryOptions({
		queryKey: feedKeys.likers(orgId, postId),
		queryFn: ({ pageParam }) => getPostLikers({ data: { postId, cursor: pageParam ?? undefined } }),
		initialPageParam: null as string | null,
		getNextPageParam: (last) => last.nextCursor,
	});

/**
 * Like toggle: sends the desired state, patches the Feed and detail caches at once, rolls both
 * back on failure. A Post removed meanwhile says so and refreshes (detail falls to `NotFound`).
 */
export function useSetLike(postId: string) {
	const qc = useQueryClient();
	const router = useRouter();
	const orgId = useOrgId();
	const listKey = feedKeys.list(orgId);
	const postKey = feedKeys.post(orgId, postId);
	return useMutation({
		mutationFn: (liked: boolean) => setLike({ data: { postId, liked } }),
		onMutate: async (liked) => {
			await Promise.all([
				qc.cancelQueries({ queryKey: listKey }),
				qc.cancelQueries({ queryKey: postKey }),
			]);
			const list = qc.getQueryData<InfiniteData<FeedPage>>(listKey);
			const detail = qc.getQueryData<FeedPost<"detail">>(postKey);
			if (list)
				qc.setQueryData<InfiniteData<FeedPage>>(listKey, {
					...list,
					pages: list.pages.map((page) => ({
						...page,
						posts: page.posts.map((p) =>
							p.id === postId ? { ...p, likes: withLike(p.likes, liked) } : p
						),
					})),
				});
			if (detail) qc.setQueryData(postKey, { ...detail, likes: withLike(detail.likes, liked) });
			return { list, detail };
		},
		onError: async (error, _liked, snapshot) => {
			if (snapshot?.list) qc.setQueryData(listKey, snapshot.list);
			if (snapshot?.detail) qc.setQueryData(postKey, snapshot.detail);
			if (isAppError(error) && error.kind === "NotFound") {
				toast.error("This Post was removed");
				qc.removeQueries({ queryKey: postKey });
				await qc.invalidateQueries({ queryKey: listKey });
				await router.invalidate();
				return;
			}
			toastMutationError("Like", "Failed to update like")(error);
		},
		onSettled: () => qc.invalidateQueries({ queryKey: feedKeys.likers(orgId, postId) }),
	});
}

/** A Memory's editable source; fetched when the edit Drawer opens. */
export const memoryEditQuery = (orgId: string, postId: string) =>
	queryOptions({
		queryKey: feedKeys.memoryEdit(orgId, postId),
		queryFn: () => getMemoryForEdit({ data: { postId } }),
		staleTime: 0,
	});

/** Author edits a Memory; Feed and detail refetch (order unchanged). */
export function useUpdateMemory(postId: string) {
	const qc = useQueryClient();
	const orgId = useOrgId();
	const posthog = usePostHog();
	return useMutation({
		mutationFn: (data: MemoryInput) => updateMemory({ data: { ...data, postId } }),
		onSuccess: async () => {
			toast.success("Memory updated");
			posthog.capture("memory_edited");
			await qc.invalidateQueries({ queryKey: feedKeys.all(orgId) });
		},
		onError: toastMutationError("Memory", "Failed to update memory"),
	});
}

/**
 * Remove a Post. Refreshes the Feed list only: the caller leaves the detail page first, then
 * drops the Post's cached entries (`forgetPost`), so nothing refetches a removed Post.
 */
export function useRemovePost() {
	const qc = useQueryClient();
	const orgId = useOrgId();
	const posthog = usePostHog();
	const mutation = useMutation({
		mutationFn: (postId: string) => removePost({ data: { postId } }),
		onSuccess: async () => {
			toast.success("Post removed");
			posthog.capture("post_removed");
			await qc.invalidateQueries({ queryKey: feedKeys.list(orgId) });
		},
		onError: toastMutationError("Post", "Failed to remove post"),
	});
	const forgetPost = (postId: string) =>
		qc.removeQueries({ queryKey: feedKeys.post(orgId, postId) });
	return { ...mutation, forgetPost };
}
