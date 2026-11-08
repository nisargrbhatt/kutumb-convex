import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { PageHeader } from "@/components/CommunityLayout/PageHeader";
import { PostDetail } from "@/components/feed/kinds";
import { isAppError } from "@/domain/errors";
import { safeAsync } from "@/lib/safe";
import { feedPostQuery } from "@/queries/feed";

export const Route = createFileRoute("/_authed/_community/feed/$postId/")({
	loader: async ({ context, params }) => {
		const result = await safeAsync(
			context.queryClient.ensureQueryData(feedPostQuery(context.organizationId, params.postId))
		);
		if (!result.success) {
			if (isAppError(result.error) && result.error.kind === "NotFound") throw notFound();
			throw result.error;
		}
	},
	component: PostPage,
});

function PostPage() {
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
