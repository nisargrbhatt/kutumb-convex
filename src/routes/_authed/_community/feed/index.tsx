import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ImagePlus, Plus } from "lucide-react";
import { PageHeader } from "@/components/CommunityLayout/PageHeader";
import { AuthorAvatar } from "@/components/feed/AuthorLine";
import { PostCard } from "@/components/feed/kinds";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { nameInitials } from "@/domain/communityProfile";
import { feedQuery } from "@/queries/feed";
import { useMyPhotoBlobId } from "@/queries/communityProfile";

/** `marked` rides in with the Drawer, never on the Feed's first load. */
const MemoryDrawer = lazy(() => import("@/components/feed/MemoryDrawer"));

export const Route = createFileRoute("/_authed/_community/feed/")({
	loader: ({ context }) =>
		context.queryClient.ensureInfiniteQueryData(feedQuery(context.organizationId)),
	component: FeedPage,
});

function CardSkeleton() {
	return (
		<Card className="gap-3 py-4" aria-hidden>
			<CardContent className="flex flex-col gap-3 px-4">
				<div className="flex items-center gap-2">
					<Skeleton className="size-9 rounded-full" />
					<div className="flex flex-col gap-1">
						<Skeleton className="h-3.5 w-28" />
						<Skeleton className="h-3 w-16" />
					</div>
				</div>
				<Skeleton className="h-5 w-2/3" />
				<Skeleton className="h-12 w-full" />
			</CardContent>
		</Card>
	);
}

function SharePrompt({ onOpen }: { onOpen: () => void }) {
	const { session, organizationId } = Route.useRouteContext();
	const photoBlobId = useMyPhotoBlobId(organizationId);
	const name = session?.user.name ?? "";
	return (
		<Card className="py-3">
			<CardContent className="flex items-center gap-3 px-4">
				<AuthorAvatar
					author={{ name, initials: nameInitials(name), profileId: null, photoBlobId }}
					className="size-9 shrink-0"
				/>
				<button
					type="button"
					className="h-9 min-w-0 flex-1 truncate rounded-full bg-muted px-4 text-left text-sm text-muted-foreground hover:bg-muted/70 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
					onClick={onOpen}
				>
					Share a memory
				</button>
			</CardContent>
		</Card>
	);
}

function FeedPage() {
	const { organizationId: orgId } = Route.useRouteContext();
	const query = useInfiniteQuery(feedQuery(orgId));
	const posts = query.data?.pages.flatMap((p) => p.posts) ?? [];
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [drawerLoaded, setDrawerLoaded] = useState(false);
	const openDrawer = () => {
		setDrawerLoaded(true);
		setDrawerOpen(true);
	};

	const sentinel = useRef<HTMLDivElement>(null);
	const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
	useEffect(() => {
		const el = sentinel.current;
		if (!el || !hasNextPage) return;
		const io = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
			},
			{ rootMargin: "400px" }
		);
		io.observe(el);
		return () => io.disconnect();
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);

	return (
		<div className="flex h-full w-full min-w-0 flex-col items-start justify-start gap-4 overflow-y-auto p-2 pb-16 md:p-4 md:pb-16">
			<PageHeader
				crumbs={[{ label: "Feed" }]}
				title="Feed"
				description="What your community is sharing."
				actions={
					<Button onClick={openDrawer} className="md:hidden">
						<Plus /> Share
					</Button>
				}
			/>

			<div className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-4">
				{posts.length > 0 ? (
					<div className="max-md:hidden">
						<SharePrompt onOpen={openDrawer} />
					</div>
				) : null}

				{query.isPending ? (
					<>
						<CardSkeleton />
						<CardSkeleton />
					</>
				) : posts.length === 0 ? (
					<Empty className="border">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<ImagePlus />
							</EmptyMedia>
							<EmptyTitle>No memories yet</EmptyTitle>
							<EmptyDescription>Be the first to share one with your community.</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>
							<Button onClick={openDrawer}>Share a memory</Button>
						</EmptyContent>
					</Empty>
				) : (
					<ul className="flex flex-col gap-4" aria-label="Feed">
						{posts.map((p) => (
							<li key={p.id} className="min-w-0">
								<PostCard post={p} />
							</li>
						))}
					</ul>
				)}

				<div ref={sentinel} className="flex flex-col gap-4" aria-live="polite">
					{isFetchingNextPage ? <CardSkeleton /> : null}
					{hasNextPage && !isFetchingNextPage ? (
						<Button variant="ghost" className="self-center" onClick={() => void fetchNextPage()}>
							Load more
						</Button>
					) : null}
					{!hasNextPage && posts.length > 0 ? (
						<p className="py-4 text-center text-xs text-muted-foreground">
							That's everything so far.
						</p>
					) : null}
				</div>
			</div>

			{drawerLoaded ? (
				<Suspense fallback={null}>
					<MemoryDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
				</Suspense>
			) : null}
		</div>
	);
}
