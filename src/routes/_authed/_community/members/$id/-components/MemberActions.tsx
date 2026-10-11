import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
	BadgeCheckIcon,
	CheckIcon,
	EllipsisIcon,
	PencilIcon,
	PowerIcon,
	PowerOffIcon,
	Trash2Icon,
	User,
	XIcon,
} from "lucide-react";
import { useForm } from "react-hook-form";
import z from "zod";
import { RejectRequestDialog } from "@/components/changeRequest/RejectRequestDialog";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { Button } from "@/components/ui/button";
import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxList,
} from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { FormDrawer } from "@/components/ui/form-drawer";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { COMMUNITY_PROFILE_STATUS } from "@/db/constants";
import { toFormValues, type CommunityProfileRow } from "@/domain/communityProfile";
import type { CustomFieldDefinition } from "@/domain/customFields";
import { useCan } from "@/hooks/useCan";
import { authClient } from "@/lib/auth-client";
import { pendingCreateRequestQuery, useReviewChangeRequest } from "@/queries/changeRequest";
import {
	pendingRequestCountQuery,
	useDeactivateProfile,
	useDeleteProfile,
	useReactivateProfile,
	useReassignProfile,
	useUpdateProfileInfo,
} from "@/queries/communityProfile";
import { useOrgId } from "@/queries/mutation";

const formSchema = z.object({
	userId: z.string().trim().min(1, "User is required"),
});

type Profile = Omit<CommunityProfileRow, "organizationId">;
type Confirm = "deactivate" | "reactivate" | "delete" | "reject" | null;

/** "N pending requests will be superseded." (or nothing while loading / none). */
function SupersedeWarning({ profileId, enabled }: { profileId: string; enabled: boolean }) {
	const orgId = useOrgId();
	const { data: n } = useQuery({ ...pendingRequestCountQuery(orgId, profileId), enabled });
	if (!n) return null;
	return (
		<span className="mt-2 block font-medium text-foreground">
			{n} pending {n === 1 ? "request" : "requests"} will be superseded.
		</span>
	);
}

/** Owner/admin actions on a member detail page: edit (Userless), Review, assign, lifecycle. */
export function MemberActions({
	profile,
	customFieldDefs,
}: {
	profile: Profile;
	customFieldDefs: CustomFieldDefinition[];
}) {
	const navigate = useNavigate();
	const [showReassignDialog, setShowReassignDialog] = useState(false);
	const [editOpen, setEditOpen] = useState(false);
	const [confirm, setConfirm] = useState<Confirm>(null);
	const { data: activeOrg } = authClient.useActiveOrganization();
	const canReview = useCan({ changeRequest: ["review"] });
	const canReassign = useCan({ communityProfile: ["reassign"] });
	const canDelete = useCan({ communityProfile: ["delete"] });

	const orgMembers = activeOrg?.members ?? [];
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			userId: "",
		},
	});

	const orgId = useOrgId();
	const isDraft = profile.status === COMMUNITY_PROFILE_STATUS.draft;
	const { data: createRequest } = useQuery({
		...pendingCreateRequestQuery(orgId, profile.id),
		enabled: canReview && isDraft,
	});
	const approve = useReviewChangeRequest();
	// Rejecting a create deletes the draft: leave its page first.
	const reject = useReviewChangeRequest(() => navigate({ to: "/members" }));
	const reassign = useReassignProfile(profile.id);
	const update = useUpdateProfileInfo(profile.id);
	const deactivate = useDeactivateProfile(profile.id);
	const reactivate = useReactivateProfile(profile.id);
	const remove = useDeleteProfile(profile.id, () => navigate({ to: "/members" }));

	const handleReassign = (values: z.infer<typeof formSchema>) =>
		reassign.mutate(values.userId, {
			onSuccess: () => {
				setShowReassignDialog(false);
				form.reset();
			},
		});

	const isUserless = profile.userId == null;
	const isActive = profile.status === COMMUNITY_PROFILE_STATUS.active;
	const isInactive = profile.status === COMMUNITY_PROFILE_STATUS.inactive;
	const showDecision = canReview && isDraft && createRequest != null;
	const showReassign = canReassign && isUserless && isActive;
	const showLifecycle = isActive || isInactive || canDelete;
	const closeConfirm = () => setConfirm(null);

	return (
		<div className="flex items-center gap-2">
			{isUserless ? (
				<Button variant="outline" onClick={() => setEditOpen(true)}>
					<PencilIcon />
					Edit
				</Button>
			) : null}
			<DropdownMenu>
				<DropdownMenuTrigger
					render={<Button variant="outline" size="icon" aria-label="More profile actions" />}
				>
					<EllipsisIcon />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					{showDecision ? (
						<DropdownMenuGroup>
							<DropdownMenuLabel>Review draft</DropdownMenuLabel>
							<DropdownMenuItem
								onClick={() =>
									approve.mutate({
										changeRequestId: createRequest.id,
										review: { decision: "approve" },
									})
								}
								disabled={approve.isPending}
							>
								<CheckIcon />
								Accept
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => setConfirm("reject")}>
								<XIcon />
								Reject
							</DropdownMenuItem>
						</DropdownMenuGroup>
					) : null}
					{showReassign ? (
						<DropdownMenuGroup>
							<DropdownMenuLabel>Profile Assign</DropdownMenuLabel>
							<DropdownMenuItem onClick={() => setShowReassignDialog(true)}>
								<User />
								Assign to User
							</DropdownMenuItem>
						</DropdownMenuGroup>
					) : null}
					{(showDecision || showReassign) && showLifecycle ? <DropdownMenuSeparator /> : null}
					{showLifecycle ? (
						<DropdownMenuGroup>
							<DropdownMenuLabel>Lifecycle</DropdownMenuLabel>
							{isActive ? (
								<DropdownMenuItem onClick={() => setConfirm("deactivate")}>
									<PowerOffIcon />
									Deactivate
								</DropdownMenuItem>
							) : null}
							{isInactive ? (
								<DropdownMenuItem onClick={() => setConfirm("reactivate")}>
									<PowerIcon />
									Reactivate
								</DropdownMenuItem>
							) : null}
							{canDelete ? (
								<DropdownMenuItem variant="destructive" onClick={() => setConfirm("delete")}>
									<Trash2Icon />
									Delete
								</DropdownMenuItem>
							) : null}
						</DropdownMenuGroup>
					) : null}
				</DropdownMenuContent>
			</DropdownMenu>

			{createRequest ? (
				<RejectRequestDialog
					open={confirm === "reject"}
					onOpenChange={(o) => !o && closeConfirm()}
					description={`Requested by ${createRequest.submitterName}. The draft will be deleted.`}
					onReject={(reason) =>
						reject.mutate({
							changeRequestId: createRequest.id,
							review: { decision: "reject", note: reason },
						})
					}
					isPending={reject.isPending}
				/>
			) : null}
			<ConfirmDialog
				open={confirm === "deactivate"}
				onOpenChange={(o) => !o && closeConfirm()}
				title="Deactivate profile?"
				description={
					<>
						Hidden from members and the community tree until reactivated.
						<SupersedeWarning profileId={profile.id} enabled={confirm === "deactivate"} />
					</>
				}
				confirmLabel="Deactivate"
				destructive
				onConfirm={() => deactivate.mutate(undefined, { onSuccess: closeConfirm })}
				isPending={deactivate.isPending}
			/>
			<ConfirmDialog
				open={confirm === "reactivate"}
				onOpenChange={(o) => !o && closeConfirm()}
				title="Reactivate profile?"
				description="Visible to members and in the community tree again."
				confirmLabel="Reactivate"
				onConfirm={() => reactivate.mutate(undefined, { onSuccess: closeConfirm })}
				isPending={reactivate.isPending}
			/>
			<ConfirmDialog
				open={confirm === "delete"}
				onOpenChange={(o) => !o && closeConfirm()}
				title="Delete profile?"
				description={
					<>
						Permanently deletes this profile with its addresses and relations. This cannot be
						undone; the audit log keeps a snapshot.
						<SupersedeWarning profileId={profile.id} enabled={confirm === "delete"} />
					</>
				}
				confirmLabel="Delete"
				destructive
				onConfirm={() => remove.mutate()}
				isPending={remove.isPending}
			/>

			{isUserless ? (
				<ProfileForm
					mode="edit"
					open={editOpen}
					onOpenChange={setEditOpen}
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
			) : null}

			<FormDrawer
				open={showReassignDialog}
				onOpenChange={setShowReassignDialog}
				title="Assign User"
				description="This profile is added without any user. Assign a logged in user to this profile if you want to link this profile with a user."
				form={form}
				onSubmit={handleReassign}
				submitLabel="Assign"
				isPending={reassign.isPending}
			>
				<FormField
					control={form.control}
					name="userId"
					render={({ field }) => (
						<FormItem>
							<FormLabel>User</FormLabel>
							<FormControl>
								<Combobox
									items={orgMembers}
									itemToStringLabel={(i: (typeof orgMembers)[0]) => i?.user?.name ?? ""}
									onValueChange={(newVal) => {
										field.onChange(newVal?.userId);
									}}
									name={field.name}
									value={orgMembers?.find((o) => o.userId === field.value)}
								>
									<ComboboxInput placeholder="Select a person" />
									<ComboboxContent>
										<ComboboxEmpty>No items found.</ComboboxEmpty>
										<ComboboxList>
											{(item) => (
												<ComboboxItem key={item.id} value={item}>
													<Item size="xs" className="p-0">
														<ItemContent>
															<ItemTitle className="whitespace-nowrap">
																{item?.user?.name}
															</ItemTitle>
															<ItemDescription>{item?.user?.email}</ItemDescription>
														</ItemContent>
													</Item>
												</ComboboxItem>
											)}
										</ComboboxList>
									</ComboboxContent>
								</Combobox>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<Item variant="outline" size="xs">
					<ItemMedia>
						<BadgeCheckIcon className="size-5" />
					</ItemMedia>
					<ItemContent>
						<ItemTitle>
							Every user can only have 1 profile linked to them. This is a irreversible action.
						</ItemTitle>
					</ItemContent>
				</Item>
			</FormDrawer>
		</div>
	);
}
