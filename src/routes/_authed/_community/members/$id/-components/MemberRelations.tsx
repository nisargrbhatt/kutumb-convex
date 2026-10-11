import { useState } from "react";
import { Plus } from "lucide-react";
import { RelationForm } from "@/components/relations/RelationForm";
import { RelationsTable } from "@/components/relations/RelationsTable";
import { Button } from "@/components/ui/button";
import { editCopy, type ProfileEditMode } from "@/domain/memberRequests";
import { useAddRelation, useRemoveRelation } from "@/queries/communityRelation";
import type { getCommunityMemberById } from "@/server/communityProfile";

type Member = Awaited<ReturnType<typeof getCommunityMemberById>>;

/**
 * Relations of a member. Outgoing relations of Userless Profiles: edited directly (`direct`) or
 * suggested as Change Requests (`suggest`, plain member on an active profile).
 */
export function MemberRelations({
	profile,
	outgoingRelations,
	incomingRelations,
	editMode,
}: Pick<Member, "profile" | "outgoingRelations" | "incomingRelations"> & {
	editMode: ProfileEditMode;
}) {
	const [isAddOpen, setIsAddOpen] = useState(false);
	const canManage = editMode !== "none";
	const suggest = editMode === "suggest";
	const addRelation = useAddRelation(profile.id);
	const deleteRelation = useRemoveRelation(profile.id);

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
									{editCopy(suggest).addRelation.title}
								</Button>
							}
							suggest={suggest}
							description={editCopy(suggest).addRelation.description}
							onSubmit={addRelation.mutateAsync}
							isPending={addRelation.isPending}
						/>
					) : null
				}
				onDelete={canManage ? deleteRelation.mutateAsync : undefined}
				isDeleting={deleteRelation.isPending}
				suggest={suggest}
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
