import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PencilIcon, UserPlusIcon, UserRoundIcon } from "lucide-react";
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
import { toFormValues } from "@/domain/communityProfile";
import { authClient } from "@/lib/auth-client";
import { myProfileQuery, useUpsertMyProfile } from "@/queries/communityProfile";
import { customFieldsQuery } from "@/queries/fields";

export const Route = createFileRoute("/_authed/_community/profile/info/")({
	component: RouteComponent,
	loader: async ({ context }) => {
		await Promise.allSettled([
			context.queryClient.ensureQueryData(myProfileQuery(context.organizationId)),
			context.queryClient.ensureQueryData(customFieldsQuery(context.organizationId)),
		]);
	},
	pendingComponent: () => <p>Loading...</p>,
});

function RouteComponent() {
	const { data: session } = authClient.useSession();
	const { organizationId: orgId } = Route.useRouteContext();
	const { data: profile } = useSuspenseQuery(myProfileQuery(orgId));
	const { data: customFieldDefs } = useSuspenseQuery(customFieldsQuery(orgId));
	const [open, setOpen] = useState(false);
	const upsert = useUpsertMyProfile();

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
				onSubmit={(input) =>
					upsert.mutateAsync(input).then(
						() => true,
						() => false
					)
				}
				isPending={upsert.isPending}
			/>
		</div>
	);
}
