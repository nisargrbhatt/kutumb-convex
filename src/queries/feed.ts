import {
	infiniteQueryOptions,
	queryOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { usePostHog } from "@posthog/react";
import { toast } from "sonner";
import type { MemoryInput } from "@/domain/feed";
import { createMemory, getFeedPage, getFeedPost } from "@/server/feed";
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
