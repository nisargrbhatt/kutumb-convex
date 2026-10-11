import { useState } from "react";
import { PencilIcon } from "lucide-react";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { Button } from "@/components/ui/button";
import { toFormValues, type CommunityProfileRow } from "@/domain/communityProfile";
import type { CustomFieldDefinition } from "@/domain/customFields";
import { useUpdateProfileInfo } from "@/queries/communityProfile";

/**
 * Plain member's info drawer on a Userless Profile: "Suggest edit" on an active one (Change
 * Request), "Edit" on their own draft (applies directly). Owner/admin use `MemberActions`.
 */
export function MemberInfoEditButton({
	profile,
	customFieldDefs,
	suggest,
}: {
	profile: Omit<CommunityProfileRow, "organizationId">;
	customFieldDefs: CustomFieldDefinition[];
	suggest: boolean;
}) {
	const [open, setOpen] = useState(false);
	const update = useUpdateProfileInfo(profile.id);

	return (
		<>
			<Button variant="outline" onClick={() => setOpen(true)}>
				<PencilIcon />
				{suggest ? "Suggest edit" : "Edit"}
			</Button>
			<ProfileForm
				mode={suggest ? "suggest" : "edit"}
				open={open}
				onOpenChange={setOpen}
				defaultValues={toFormValues(profile)}
				customFieldDefs={customFieldDefs}
				onSubmit={(input) =>
					update.mutateAsync({ expectedVersion: profile.version, input }).then(
						() => true,
						() => false
					)
				}
				isPending={update.isPending}
			/>
		</>
	);
}
