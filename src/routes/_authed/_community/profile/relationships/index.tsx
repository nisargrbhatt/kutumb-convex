import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/CommunityLayout/PageHeader";
import { RelationForm } from "@/components/relations/RelationForm";
import { RelationsTable } from "@/components/relations/RelationsTable";
import { Button } from "@/components/ui/button";
import {
	myRelationshipsQuery,
	useAddMyRelation,
	useDeleteMyRelation,
} from "@/queries/communityRelation";

export const Route = createFileRoute("/_authed/_community/profile/relationships/")({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(myRelationshipsQuery(context.organizationId)),
	component: RouteComponent,
});

function RouteComponent() {
	const [isAddOpen, setIsAddOpen] = useState(false);
	const { organizationId: orgId } = Route.useRouteContext();
	const {
		data: { profileId, outgoing, incoming },
	} = useSuspenseQuery(myRelationshipsQuery(orgId));
	const addRelation = useAddMyRelation();
	const deleteRelation = useDeleteMyRelation();

	const counterpartIds = [...outgoing.map((r) => r.toId), ...incoming.map((r) => r.fromId)];

	return (
		<div className="flex h-full w-full flex-col items-start justify-start gap-4 overflow-y-auto p-2">
			<PageHeader
				crumbs={[{ label: "Profile", to: "/profile/info" }, { label: "Relationships" }]}
				title="Relationships"
				description="Manage your family and community relationships."
				actions={
					profileId ? (
						<RelationForm
							subjectId={profileId}
							excludeIds={counterpartIds}
							open={isAddOpen}
							onOpenChange={setIsAddOpen}
							trigger={
								<Button size="sm">
									<Plus className="size-4" />
									Add relation
								</Button>
							}
							description="Add a relative to your profile."
							onSubmit={addRelation.mutateAsync}
							isPending={addRelation.isPending}
						/>
					) : null
				}
			/>
			<div className="flex w-full flex-col gap-6 pb-12">
				<RelationsTable
					title="My relations"
					description="People you have recorded as your relatives."
					direction="outgoing"
					rows={outgoing}
					emptyText={
						profileId
							? "You have not added any relations yet."
							: "Create your profile to start adding relations."
					}
					onDelete={deleteRelation.mutateAsync}
					isDeleting={deleteRelation.isPending}
				/>
				<RelationsTable
					title="Listed as relative by"
					description="People who have recorded you as their relative."
					direction="incoming"
					rows={incoming}
					emptyText="No one has listed you as their relative yet."
				/>
			</div>
		</div>
	);
}
