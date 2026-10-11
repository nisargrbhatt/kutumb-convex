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
	/** Owner/admin editing a Userless Profile. */
	edit: {
		title: "Edit profile",
		createTitle: "Edit profile",
		description: "Changes apply directly and are recorded in the audit log.",
		submit: "Save profile",
	},
	/** Plain member on an active Userless Profile: becomes a Change Request. */
	suggest: {
		title: "Suggest edit",
		createTitle: "Suggest edit",
		description:
			"Your changes go to an owner/admin for review; only changed fields are sent. Everyone sees the current info until then.",
		submit: "Submit for review",
	},
} as const;

/**
 * Community Profile create/edit drawer. `mode` only changes copy (and shows Date of Death unless
 * `self`); the parent owns the submit adapter. `onSubmit` resolving `true` closes the drawer.
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
	description,
}: {
	mode: keyof typeof COPY;
	/** Overrides the mode's drawer description. */
	description?: string;
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
		// admin = add-member: next open starts blank; suggest: profile unchanged until review.
		// self keeps the saved values.
		// keepDirtyValues must be overridden: `reset` merges `resetOptions` in.
		form.reset(mode === "admin" || mode === "suggest" ? defaultValues : values, {
			keepDirtyValues: false,
		});
		onOpenChange(false);
	};

	return (
		<FormDrawer
			open={open}
			onOpenChange={onOpenChange}
			title={isNew ? copy.createTitle : copy.title}
			description={description ?? copy.description}
			form={form}
			onSubmit={handleSubmit}
			submitLabel={copy.submit}
			isPending={isPending}
			size="lg"
		>
			<ProfileFieldsSection showDateOfDeath={mode !== "self"} />
			<CustomFieldsSection defs={customFieldDefs} />
		</FormDrawer>
	);
}
