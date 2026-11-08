import {
	infiniteQueryOptions,
	queryOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { usePostHog } from "@posthog/react";
import { toast } from "sonner";
import type { MemoryInput } from "@/domain/feed";
import {
	createMemory,
	getFeedPage,
	getFeedPost,
	getMemoryForEdit,
	removePost,
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
