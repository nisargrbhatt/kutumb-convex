import { useEffect, useRef, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { PageHeader } from "@/components/CommunityLayout/PageHeader";
import { NotFound } from "@/components/NotFound";
import { PostDetail } from "@/components/feed/kinds";
import { Skeleton } from "@/components/ui/skeleton";
import { isAppError } from "@/domain/errors";
import { safeAsync } from "@/lib/safe";
import { feedPostQuery } from "@/queries/feed";
import { useSwitchOrganizationInPlace } from "@/queries/organization";
import { locateFeedPost } from "@/server/feed";

const isNotFound = (e: unknown) => isAppError(e) && e.kind === "NotFound";

export const Route = createFileRoute("/_authed/_community/feed/$postId/")({
	// Read-only: `defaultPreload: "intent"` runs this on hover. A Post of another of the viewer's
	// orgs only reports `switchTo`; the page component does the switch.
	loader: async ({ context, params }) => {
		const result = await safeAsync(
			context.queryClient.ensureQueryData(feedPostQuery(context.organizationId, params.postId))
		);
		if (result.success) return { switchTo: null };
		if (!isNotFound(result.error)) throw result.error;

		const located = await safeAsync(locateFeedPost({ data: { postId: params.postId } }));
		if (!located.success) {
			if (isNotFound(located.error)) throw notFound();
			throw located.error;
		}
		if (located.data.status !== "otherOrg") throw notFound();
		return { switchTo: located.data.organization };
	},
	component: PostPage,
});

function PostPage() {
	const { switchTo } = Route.useLoaderData();
	return switchTo ? <SwitchOrg organization={switchTo} /> : <PostView />;
}

/** Share link into another of the viewer's orgs: switch, stay on the Post, toast. */
function SwitchOrg({ organization }: { organization: { id: string; name: string } }) {
	const switchOrg = useSwitchOrganizationInPlace();
	const [failed, setFailed] = useState(false);
	const started = useRef(false);

	useEffect(() => {
		if (started.current) return;
		started.current = true;
		void switchOrg(organization).then((ok) => setFailed(!ok));
	}, [organization, switchOrg]);

	if (failed) return <NotFound />;
	return (
		<div
			className="flex h-full w-full min-w-0 flex-col items-start justify-start gap-4 overflow-y-auto p-2 pb-16 md:p-4 md:pb-16"
			aria-busy="true"
		>
			<PageHeader crumbs={[{ label: "Feed", to: "/feed" }, { label: "Post" }]} />
			<div className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-4">
				<p className="sr-only" role="status">
					Switching to {organization.name}
				</p>
				<Skeleton className="h-10 w-1/2" />
				<Skeleton className="h-6 w-3/4" />
				<Skeleton className="h-32 w-full" />
			</div>
		</div>
	);
}

function PostView() {
	const { organizationId: orgId } = Route.useRouteContext();
	const { postId } = Route.useParams();
	const { data: post } = useSuspenseQuery(feedPostQuery(orgId, postId));

	return (
		<div className="flex h-full w-full min-w-0 flex-col items-start justify-start gap-4 overflow-y-auto p-2 pb-16 md:p-4 md:pb-16">
			<PageHeader crumbs={[{ label: "Feed", to: "/feed" }, { label: post.data.title }]} />
			<div className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-4">
				<PostDetail post={post} />
			</div>
		</div>
	);
}
