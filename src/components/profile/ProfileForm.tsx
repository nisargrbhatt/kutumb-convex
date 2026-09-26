import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
	communityProfileFormSchema,
	toInput,
	type CommunityProfileFormValues,
	type CommunityProfileInput,
} from "@/domain/communityProfile";
import type { CustomFieldDefinition } from "@/domain/customFields";
import { FormDrawer } from "@/components/ui/form-drawer";
import { ProfileFieldsSection } from "@/components/profile/ProfileFieldsSection";
import { CustomFieldsSection } from "@/components/custom-fields/CustomFieldsSection";

const COPY = {
	self: {
		title: "Edit profile",
		createTitle: "Create profile",
		description: "Visible to other members of this community.",
		submit: "Save profile",
	},
	admin: {
		title: "Add member",
		createTitle: "Add member",
		description: "Added as a Draft Record; an owner/admin approves it.",
		submit: "Add member",
	},
} as const;

/**
 * Community Profile create/edit drawer. `mode` only changes copy (and shows Date of Death for
 * admins); the parent owns the submit adapter. `onSubmit` resolving `true` closes the drawer.
 */
export function ProfileForm({
	mode,
	open,
	onOpenChange,
	defaultValues,
	customFieldDefs,
	onSubmit,
	isPending,
	isNew = false,
}: {
	mode: keyof typeof COPY;
	/** Profile doesn't exist yet: title reads as create. */
	isNew?: boolean;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	defaultValues: CommunityProfileFormValues;
	customFieldDefs: CustomFieldDefinition[];
	onSubmit: (input: CommunityProfileInput) => Promise<boolean>;
	isPending?: boolean;
}) {
	const form = useForm<CommunityProfileFormValues>({
		resolver: zodResolver(communityProfileFormSchema),
		// `values` re-syncs after a save refetch; dirty edits survive a background refetch.
		values: defaultValues,
		resetOptions: { keepDirtyValues: true },
	});
	const copy = COPY[mode];

	const handleSubmit = async (values: CommunityProfileFormValues) => {
		if (!(await onSubmit(toInput(values)))) return;
		form.reset(values);
		onOpenChange(false);
	};

	return (
		<FormDrawer
			open={open}
			onOpenChange={onOpenChange}
			title={isNew ? copy.createTitle : copy.title}
			description={copy.description}
			form={form}
			onSubmit={handleSubmit}
			submitLabel={copy.submit}
			isPending={isPending}
			size="lg"
		>
			<ProfileFieldsSection showDateOfDeath={mode === "admin"} />
			<CustomFieldsSection defs={customFieldDefs} />
		</FormDrawer>
	);
}
