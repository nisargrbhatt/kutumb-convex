import { useState } from "react";
import { Plus } from "lucide-react";
import { RelationForm } from "@/components/relations/RelationForm";
import { RelationsTable } from "@/components/relations/RelationsTable";
import { Button } from "@/components/ui/button";
import { COMMUNITY_PROFILE_STATUS } from "@/db/constants";
import { useCan } from "@/hooks/useCan";
import { useAddRelationToProfile, useDeleteRelationFromProfile } from "@/queries/communityRelation";
import type { getCommunityMemberById } from "@/server/communityProfile";

type Member = Awaited<ReturnType<typeof getCommunityMemberById>>;

/** Relations of a member. Owner/admin manage outgoing relations of userless, active profiles. */
export function MemberRelations({
	profile,
	outgoingRelations,
	incomingRelations,
}: Pick<Member, "profile" | "outgoingRelations" | "incomingRelations">) {
	const [isAddOpen, setIsAddOpen] = useState(false);
	const canManage =
		useCan({ communityProfile: ["manageRelations"] }) &&
		profile.userId == null &&
		profile.status === COMMUNITY_PROFILE_STATUS.active;
	const addRelation = useAddRelationToProfile(profile.id);
	const deleteRelation = useDeleteRelationFromProfile(profile.id);

	const counterpartIds = [
		...outgoingRelations.map((r) => r.toId),
		...incomingRelations.map((r) => r.fromId),
	];

	return (
		<>
			<RelationsTable
				title="Relations"
				description="People this member is related to."
				direction="outgoing"
				rows={outgoingRelations}
				emptyText="This profile has no relations on record at the moment."
				action={
					canManage ? (
						<RelationForm
							subjectId={profile.id}
							excludeIds={counterpartIds}
							open={isAddOpen}
							onOpenChange={setIsAddOpen}
							trigger={
								<Button size="sm">
									<Plus className="size-4" />
									Add relation
								</Button>
							}
							description="Record an outgoing relation for this profile on its behalf."
							onSubmit={addRelation.mutateAsync}
							isPending={addRelation.isPending}
						/>
					) : null
				}
				onDelete={canManage ? deleteRelation.mutateAsync : undefined}
				isDeleting={deleteRelation.isPending}
			/>
			<RelationsTable
				title="Listed as relative by"
				description="People who have recorded this member as their relative."
				direction="incoming"
				rows={incomingRelations}
				emptyText="No one has listed this profile as their relative yet."
			/>
		</>
	);
}
