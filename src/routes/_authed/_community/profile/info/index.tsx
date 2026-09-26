import { useState } from "react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PencilIcon, UserPlusIcon, UserRoundIcon } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/CommunityLayout/PageHeader";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { ProfileIdentityHeader } from "@/components/profile/ProfileIdentityHeader";
import { ProfileInfoView } from "@/components/profile/ProfileInfoView";
import { Button } from "@/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { toFormValues, type CommunityProfileInput } from "@/domain/communityProfile";
import { isAppError } from "@/domain/errors";
import { LIMIT_COPY } from "@/domain/limits";
import { authClient } from "@/lib/auth-client";
import { safeAsync } from "@/lib/safe";
import { getMyCommunityProfileQuery } from "@/queries/communityProfile";
import { getOrganizationCustomFieldsQuery } from "@/queries/fields";
import { getOrgUsageQuery } from "@/queries/organization";
import { upsertMyCommunityProfile } from "@/server/communityProfile";

export const Route = createFileRoute("/_authed/_community/profile/info/")({
	component: RouteComponent,
	loader: async ({ context }) => {
		await Promise.allSettled([
			context.queryClient.ensureQueryData(getMyCommunityProfileQuery()),
			context.queryClient.ensureQueryData(getOrganizationCustomFieldsQuery()),
		]);
	},
	pendingComponent: () => <p>Loading...</p>,
});

// TODO(issue 09): replace with useUpsertMyProfile().
function useSaveMyProfile() {
	const queryClient = useQueryClient();
	const [isPending, setIsPending] = useState(false);

	const save = async (input: CommunityProfileInput) => {
		setIsPending(true);
		const result = await safeAsync(upsertMyCommunityProfile({ data: input }));
		setIsPending(false);

		if (!result.success) {
			console.error(result.error);
			const limit =
				isAppError(result.error) && result.error.kind === "LimitReached"
					? LIMIT_COPY.profileSelf
					: undefined;
			toast.error(limit?.title ?? "Profile", {
				description: limit?.description ?? result.error?.message ?? "Failed to save profile",
			});
			return false;
		}

		toast.success("Profile saved");
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: getMyCommunityProfileQuery().queryKey }),
			queryClient.invalidateQueries({ queryKey: getOrgUsageQuery().queryKey }),
		]);
		return true;
	};

	return { save, isPending };
}

function RouteComponent() {
	const { data: session } = authClient.useSession();
	const { data: profile } = useSuspenseQuery(getMyCommunityProfileQuery());
	const { data: customFieldDefs } = useSuspenseQuery(getOrganizationCustomFieldsQuery());
	const [open, setOpen] = useState(false);
	const { save, isPending } = useSaveMyProfile();

	return (
		<div className="flex h-full w-full flex-col items-start justify-start gap-4 overflow-y-auto p-2">
			<PageHeader
				crumbs={[{ label: "Profile", to: "/profile/info" }, { label: "Info" }]}
				title="Profile"
				description="Your community profile, visible to other members of this community."
				actions={
					profile ? (
						<Button onClick={() => setOpen(true)}>
							<PencilIcon />
							Edit
						</Button>
					) : null
				}
			/>

			<div className="flex w-full flex-col gap-6 pb-12">
				{profile ? (
					<>
						<ProfileIdentityHeader profile={profile} />
						<ProfileInfoView profile={profile} customFieldDefs={customFieldDefs} />
					</>
				) : (
					<Empty className="border border-dashed">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<UserRoundIcon />
							</EmptyMedia>
							<EmptyTitle>No profile yet</EmptyTitle>
							<EmptyDescription>
								Create your community profile so other members can find and relate to you.
							</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>
							<Button onClick={() => setOpen(true)}>
								<UserPlusIcon />
								Create profile
							</Button>
						</EmptyContent>
					</Empty>
				)}
			</div>

			<ProfileForm
				mode="self"
				isNew={!profile}
				open={open}
				onOpenChange={setOpen}
				defaultValues={toFormValues(profile, {
					gender: "male",
					email: session?.user?.email ?? "",
				})}
				customFieldDefs={customFieldDefs}
				onSubmit={save}
				isPending={isPending}
			/>
		</div>
	);
}
