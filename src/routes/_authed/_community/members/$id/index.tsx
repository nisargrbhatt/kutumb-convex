import { ProfileAvatar } from "@/components/profile/ProfileName";
import { ProfileStatusBadge } from "@/components/profile/ProfileStatusBadge";
import { ProfileInfoView } from "@/components/profile/ProfileInfoView";
import { FormDrawer } from "@/components/ui/form-drawer";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { fullName } from "@/domain/communityProfile";
import { PageHeader } from "@/components/CommunityLayout/PageHeader";
import {
	acceptCommunityProfile,
	getCommunityMemberById,
	reassignProfileToUser,
	rejectCommunityProfile,
} from "@/server/communityProfile";
import { getActiveProfilesForRelationQuery } from "@/queries/communityProfile";
import {
	addCommunityRelationToProfile,
	deleteCommunityRelationFromProfile,
} from "@/server/communityRelation";
import { COMMUNITY_RELATION_TYPE } from "@/db/constants";
import { formatRelationType, relationTypeSchema } from "@/domain/relation";
import { safeAsync } from "@/lib/safe";
import { isAppError } from "@/domain/errors";
import { createFileRoute, notFound, useRouter } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Mail, Phone, User, CheckIcon, XIcon, BadgeCheckIcon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useCan } from "@/hooks/useCan";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { usePostHog } from "@posthog/react";
import { useState } from "react";
import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxList,
} from "@/components/ui/combobox";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getOrgUsageQuery } from "@/queries/organization";
import { useForm } from "react-hook-form";
import z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Users, Heart, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authed/_community/members/$id/")({
	component: RouteComponent,
	loader: async ({ params }) => {
		const result = await safeAsync(
			getCommunityMemberById({
				data: {
					id: params.id,
				},
			})
		);

		if (!result.success) {
			if (isAppError(result.error) && result.error.kind === "NotFound") {
				throw notFound();
			}
			throw result.error;
		}

		return result.data;
	},
});

const formSchema = z.object({
	userId: z.string().trim().min(1, "User is required"),
});

function MemberActions() {
	const router = useRouter();
	const { profile } = Route.useLoaderData();
	const [showReassignDialog, setShowReassignDialog] = useState(false);
	const { data: activeOrg } = authClient.useActiveOrganization();
	const posthog = usePostHog();
	const queryClient = useQueryClient();

	const orgMembers = activeOrg?.members ?? [];
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			userId: "",
		},
	});

	const acceptMember = async () => {
		const result = await safeAsync(
			acceptCommunityProfile({
				data: {
					memberId: profile.id,
				},
			})
		);

		if (!result.success) {
			console.error(result.error);
			toast.error("Profile", {
				description: "Failed to accept profile",
			});
			return;
		}

		posthog.capture("member_profile_accepted", { member_id: profile.id });
		toast.success("Profile", {
			description: "Profile accepted successfully",
		});

		router.invalidate();
	};
	const rejectMember = async () => {
		const result = await safeAsync(
			rejectCommunityProfile({
				data: {
					memberId: profile.id,
				},
			})
		);

		if (!result.success) {
			console.error(result.error);
			toast.error("Profile", {
				description: "Failed to reject profile",
			});
			return;
		}

		posthog.capture("member_profile_rejected", { member_id: profile.id });
		toast.success("Profile", {
			description: "Profile rejected successfully",
		});
		queryClient.invalidateQueries({ queryKey: getOrgUsageQuery().queryKey });

		router.invalidate();
	};

	const handleReassign = async (values: z.infer<typeof formSchema>) => {
		const result = await safeAsync(
			reassignProfileToUser({
				data: {
					userId: values.userId,
					memberId: profile.id,
				},
			})
		);

		if (!result.success) {
			console.error(result.error);
			toast.error("Profile", {
				description: "Failed to reassign profile",
			});
			return;
		}

		posthog.capture("member_profile_reassigned", {
			member_id: profile.id,
			assigned_user_id: values.userId,
		});
		toast.success("Profile", {
			description: "Profile reassigned successfully",
		});

		router.invalidate();
		setShowReassignDialog(false);
		form.reset();
	};

	const showProfileActions = profile?.status === "draft";
	const showReassignAction = typeof profile?.userId !== "string";

	if (!showProfileActions && !showReassignAction) {
		return null;
	}

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger render={<Button variant="outline" />}>Actions</DropdownMenuTrigger>
				<DropdownMenuContent>
					{showProfileActions ? (
						<DropdownMenuGroup>
							<DropdownMenuLabel>Profile Decision</DropdownMenuLabel>
							<DropdownMenuItem onClick={acceptMember}>
								<CheckIcon />
								Accept
							</DropdownMenuItem>
							<DropdownMenuItem onClick={rejectMember}>
								<XIcon />
								Reject
							</DropdownMenuItem>
						</DropdownMenuGroup>
					) : null}
					{showReassignAction ? (
						<DropdownMenuGroup>
							<DropdownMenuLabel>Profile Assign</DropdownMenuLabel>
							<DropdownMenuItem onClick={() => setShowReassignDialog(true)}>
								<User />
								Assign to User
							</DropdownMenuItem>
						</DropdownMenuGroup>
					) : null}
				</DropdownMenuContent>
			</DropdownMenu>
			<FormDrawer
				open={showReassignDialog}
				onOpenChange={setShowReassignDialog}
				title="Assign User"
				description="This profile is added without any user. Assign a logged in user to this profile if you want to link this profile with a user."
				form={form}
				onSubmit={handleReassign}
				submitLabel="Assign"
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
		</>
	);
}

function RouteComponent() {
	const { profile, addresses, customFieldDefs, outgoingRelations, incomingRelations } =
		Route.useLoaderData();
	const canApprove = useCan({ communityProfile: ["approve"] });
	const canManageProfileRelations = useCan({ communityProfile: ["manageRelations"] });

	const name = fullName(profile);

	const showActionBlock = canApprove;

	const canManageRelations =
		canManageProfileRelations && profile.userId == null && profile.status === "active";

	return (
		<div className="flex h-full w-full flex-col items-start justify-start gap-4 overflow-y-auto p-2">
			<PageHeader crumbs={[{ label: "Members", to: "/members" }, { label: name }]} />

			<div className="flex w-full flex-col gap-6 pb-12">
				{/* Identity header */}
				<div className="flex flex-col justify-between gap-4 rounded-lg border p-6 sm:flex-row sm:items-center">
					<div className="flex items-center gap-4">
						<ProfileAvatar
							profile={profile}
							className="size-16 sm:size-20"
							fallbackClassName="text-xl"
						/>

						<div className="flex min-w-0 flex-col gap-1.5">
							<div className="flex flex-wrap items-center gap-2">
								<h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{name}</h1>
								<ProfileStatusBadge status={profile.status} />
							</div>
							{profile.nickName && (
								<p className="flex items-center gap-1.5 text-sm text-muted-foreground">
									<User className="size-4" />"{profile.nickName}"
								</p>
							)}
							{(profile.email || profile.mobileNumber) && (
								<div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
									{profile.email && (
										<span className="flex items-center gap-1.5">
											<Mail className="size-3.5" />
											{profile.email}
										</span>
									)}
									{profile.mobileNumber && (
										<span className="flex items-center gap-1.5">
											<Phone className="size-3.5" />
											{profile.mobileNumber}
										</span>
									)}
								</div>
							)}
						</div>
					</div>
					{showActionBlock ? <MemberActions /> : null}
				</div>

				<ProfileInfoView profile={profile} customFieldDefs={customFieldDefs} />

				{/* Addresses */}
				<div className="flex flex-col gap-3">
					<div>
						<h2 className="text-lg font-medium">Addresses</h2>
						<p className="text-sm text-muted-foreground">
							Residential, work, and other addresses on record.
						</p>
					</div>

					{addresses && addresses.length > 0 ? (
						<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
							{addresses.map((address) => (
								<Card key={address.id} className="rounded-lg border">
									<CardHeader className="border-b pb-3">
										<div className="flex items-center justify-between">
											<CardTitle className="flex items-center gap-2 text-base font-medium">
												<MapPin className="size-4 text-muted-foreground" />
												Address
											</CardTitle>
											<Badge variant="secondary" className="capitalize">
												{address.type}
											</Badge>
										</div>
									</CardHeader>
									<CardContent className="pt-4">
										<div className="flex flex-col gap-1 text-sm text-foreground/80">
											<span className="mb-1 font-medium text-foreground">{address.line1}</span>
											{address.line2 && <span>{address.line2}</span>}
											<span>
												{address.city}, {address.state} {address.postalCode}
											</span>
											<span>{address.country}</span>

											{address.digipin && (
												<div className="mt-3">
													<Badge variant="outline" className="bg-muted/40 font-mono tracking-wider">
														DIGIPIN: {address.digipin}
													</Badge>
												</div>
											)}

											{address.note && (
												<p className="mt-4 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground italic">
													{address.note}
												</p>
											)}
										</div>
									</CardContent>
								</Card>
							))}
						</div>
					) : (
						<Card className="rounded-lg border border-dashed">
							<CardContent className="flex flex-col items-center justify-center py-16 text-center">
								<div className="mb-4 rounded-full bg-muted/50 p-4">
									<MapPin className="size-8 text-muted-foreground/50" />
								</div>
								<h3 className="text-lg font-medium text-foreground">No Addresses Found</h3>
								<p className="mt-1 max-w-sm text-sm text-muted-foreground">
									This profile does not have any related addresses on record at the moment.
								</p>
							</CardContent>
						</Card>
					)}
				</div>

				{/* Relations */}
				<RelationsTable
					title="Relations"
					description="People this member is related to."
					icon={<Users />}
					emptyText="This profile has no relations on record at the moment."
					action={canManageRelations ? <AddRelationSheet subject={profile} /> : null}
					rows={outgoingRelations.map((r) => ({
						id: r.id,
						type: r.type,
						note: r.note,
						bloodRelation: r.bloodRelation,
						counterpart: r.toCommunityProfile,
					}))}
					rowAction={
						canManageRelations
							? (row) => <DeleteRelationDialog subjectId={profile.id} relationId={row.id} />
							: undefined
					}
				/>

				{/* Listed as relative by */}
				<RelationsTable
					title="Listed as relative by"
					description="People who have recorded this member as their relative."
					icon={<Heart />}
					emptyText="No one has listed this profile as their relative yet."
					rows={incomingRelations.map((r) => ({
						id: r.id,
						type: r.type,
						note: r.note,
						bloodRelation: r.bloodRelation,
						counterpart: r.fromCommunityProfile,
					}))}
				/>
			</div>
		</div>
	);
}

type CounterpartProfile = {
	firstName: string;
	middleName: string | null;
	lastName: string;
	nickName: string | null;
} | null;

type RelationRow = {
	id: string;
	type: string | null;
	note: string | null;
	bloodRelation: boolean | null;
	counterpart: CounterpartProfile;
};

function counterpartName(profile: CounterpartProfile) {
	if (!profile) return "Unknown";
	const name = [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(" ");
	return name || profile.nickName || "Unknown";
}

function RelationsTable({
	title,
	description,
	icon,
	rows,
	emptyText,
	action,
	rowAction,
}: {
	title: string;
	description: string;
	icon: React.ReactNode;
	rows: RelationRow[];
	emptyText: string;
	action?: React.ReactNode;
	rowAction?: (row: RelationRow) => React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
				<div>
					<h2 className="flex items-center gap-2 text-lg font-medium">
						<span className="text-muted-foreground [&>svg]:size-5">{icon}</span>
						{title}
					</h2>
					<p className="text-sm text-muted-foreground">{description}</p>
				</div>
				{action ? <div className="shrink-0">{action}</div> : null}
			</div>

			{rows.length > 0 ? (
				<div className="w-full overflow-x-auto rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Relation</TableHead>
								<TableHead>Blood Relation</TableHead>
								<TableHead>Note</TableHead>
								{rowAction ? <TableHead className="w-0 text-right">Actions</TableHead> : null}
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((row) => (
								<TableRow key={row.id}>
									<TableCell className="font-medium">{counterpartName(row.counterpart)}</TableCell>
									<TableCell>{formatRelationType(row.type)}</TableCell>
									<TableCell>
										{row.bloodRelation ? (
											<Badge variant="secondary">Blood</Badge>
										) : (
											<span className="text-muted-foreground">-</span>
										)}
									</TableCell>
									<TableCell className="text-muted-foreground">{row.note || "-"}</TableCell>
									{rowAction ? (
										<TableCell className="text-right">{rowAction(row)}</TableCell>
									) : null}
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			) : (
				<Card className="rounded-lg border border-dashed">
					<CardContent className="flex flex-col items-center justify-center py-12 text-center">
						<div className="mb-4 rounded-full bg-muted/50 p-4 text-muted-foreground/50 [&>svg]:size-8">
							{icon}
						</div>
						<p className="max-w-sm text-sm text-muted-foreground">{emptyText}</p>
					</CardContent>
				</Card>
			)}
		</div>
	);
}

const addRelationFormSchema = z.object({
	toId: z.string().trim().min(1, "Relative is required"),
	type: relationTypeSchema,
	bloodRelation: z.boolean().default(false).optional(),
	note: z.string().optional(),
});

function AddRelationSheet({ subject }: { subject: { id: string } }) {
	const router = useRouter();
	const posthog = usePostHog();
	const [open, setOpen] = useState(false);

	const { data: profiles = [], isLoading } = useQuery({
		...getActiveProfilesForRelationQuery(subject.id),
		enabled: open,
	});

	const form = useForm<z.infer<typeof addRelationFormSchema>>({
		resolver: zodResolver(addRelationFormSchema),
		defaultValues: {
			toId: "",
			type: COMMUNITY_RELATION_TYPE.brother,
			bloodRelation: false,
			note: "",
		},
	});

	const onSubmit = form.handleSubmit(async (values) => {
		const result = await safeAsync(
			addCommunityRelationToProfile({
				data: {
					subjectId: subject.id,
					toId: values.toId,
					type: values.type,
					bloodRelation: values.bloodRelation,
					note: values.note,
				},
			})
		);

		if (!result.success) {
			console.error(result.error);
			toast.error("Relation", {
				description: result.error?.message ?? "Failed to add relation",
			});
			return;
		}

		posthog.capture("member_relation_added", { member_id: subject.id });
		toast.success("Relation", {
			description: "Relation added successfully",
		});

		form.reset();
		setOpen(false);
		router.invalidate();
	});

	const selectedProfile = profiles.find((p) => p.id === form.watch("toId"));

	return (
		<Sheet
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) form.reset();
			}}
		>
			<SheetTrigger
				render={
					<Button size="sm">
						<Plus className="size-4" />
						Add Relation
					</Button>
				}
			/>

			<SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
				<SheetHeader>
					<SheetTitle>Add Relation</SheetTitle>
					<SheetDescription>
						Record an outgoing relation for this profile on its behalf.
					</SheetDescription>
				</SheetHeader>
				<Form {...form}>
					<form onSubmit={onSubmit} className="flex flex-1 flex-col">
						<div className="flex flex-col gap-4 px-6 pb-6">
							<FormField
								control={form.control}
								name="toId"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Relative</FormLabel>
										<FormControl>
											<Combobox
												items={profiles}
												itemToStringLabel={(i: (typeof profiles)[0]) =>
													[i?.firstName, i?.middleName, i?.lastName].filter(Boolean).join(" ")
												}
												onValueChange={(newVal) => {
													field.onChange(newVal?.id ?? "");
												}}
												name={field.name}
												value={selectedProfile}
											>
												<ComboboxInput placeholder={isLoading ? "Loading..." : "Select a person"} />
												<ComboboxContent>
													<ComboboxEmpty>No active profiles found.</ComboboxEmpty>
													<ComboboxList>
														{(item) => (
															<ComboboxItem key={item.id} value={item}>
																<Item size="xs" className="p-0">
																	<ItemContent>
																		<ItemTitle className="whitespace-nowrap">
																			{[item.firstName, item.middleName, item.lastName]
																				.filter(Boolean)
																				.join(" ")}
																		</ItemTitle>
																		{item.nickName ? (
																			<ItemDescription>{item.nickName}</ItemDescription>
																		) : null}
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
							<FormField
								control={form.control}
								name="type"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Relation Type</FormLabel>
										<Select onValueChange={field.onChange} value={field.value}>
											<FormControl>
												<SelectTrigger className="w-full">
													<SelectValue placeholder="Select relation type" />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{Object.values(COMMUNITY_RELATION_TYPE).map((type) => (
													<SelectItem key={type} value={type} className="capitalize">
														{formatRelationType(type)}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="bloodRelation"
								render={({ field }) => (
									<FormItem className="flex flex-row items-start space-y-0 space-x-3 rounded-md border p-4">
										<FormControl>
											<Checkbox checked={field.value} onCheckedChange={field.onChange} />
										</FormControl>
										<div className="space-y-1 leading-none">
											<FormLabel>Blood Relation</FormLabel>
											<FormDescription>Is this relation by blood?</FormDescription>
										</div>
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="note"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Note</FormLabel>
										<FormControl>
											<Textarea placeholder="Optional note" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<SheetFooter>
							<Button type="submit" disabled={form.formState.isSubmitting}>
								{form.formState.isSubmitting ? "Adding..." : "Add Relation"}
							</Button>
							<Button type="button" variant="outline" onClick={() => setOpen(false)}>
								Cancel
							</Button>
						</SheetFooter>
					</form>
				</Form>
			</SheetContent>
		</Sheet>
	);
}

function DeleteRelationDialog({
	subjectId,
	relationId,
}: {
	subjectId: string;
	relationId: string;
}) {
	const router = useRouter();
	const posthog = usePostHog();
	const [open, setOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	const onDelete = async () => {
		setIsDeleting(true);
		const result = await safeAsync(
			deleteCommunityRelationFromProfile({
				data: {
					subjectId,
					relationId,
				},
			})
		);
		setIsDeleting(false);

		if (!result.success) {
			console.error(result.error);
			toast.error("Relation", {
				description: result.error?.message ?? "Failed to delete relation",
			});
			return;
		}

		posthog.capture("member_relation_deleted", { member_id: subjectId });
		toast.success("Relation", {
			description: "Relation deleted successfully",
		});

		setOpen(false);
		router.invalidate();
	};

	return (
		<ConfirmDialog
			open={open}
			onOpenChange={setOpen}
			trigger={
				<Button variant="ghost" size="icon" aria-label="Delete relation">
					<Trash2 className="size-4 text-destructive" />
				</Button>
			}
			title="Delete relation"
			description="This removes the outgoing relation from this profile. This action cannot be undone."
			confirmLabel="Delete"
			destructive
			onConfirm={onDelete}
			isPending={isDeleting}
		/>
	);
}
