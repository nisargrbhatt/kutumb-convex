import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { BadgeCheckIcon, CheckIcon, User, XIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import z from "zod";
import { Button } from "@/components/ui/button";
import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxList,
} from "@/components/ui/combobox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { FormDrawer } from "@/components/ui/form-drawer";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { authClient } from "@/lib/auth-client";
import {
	useApproveProfile,
	useReassignProfile,
	useRejectProfile,
} from "@/queries/communityProfile";

const formSchema = z.object({
	userId: z.string().trim().min(1, "User is required"),
});

export function MemberActions({
	profile,
}: {
	profile: { id: string; status: string; userId: string | null };
}) {
	const [showReassignDialog, setShowReassignDialog] = useState(false);
	const { data: activeOrg } = authClient.useActiveOrganization();

	const orgMembers = activeOrg?.members ?? [];
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			userId: "",
		},
	});

	const approve = useApproveProfile(profile.id);
	const reject = useRejectProfile(profile.id);
	const reassign = useReassignProfile(profile.id);

	const handleReassign = (values: z.infer<typeof formSchema>) =>
		reassign.mutate(values.userId, {
			onSuccess: () => {
				setShowReassignDialog(false);
				form.reset();
			},
		});

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
							<DropdownMenuItem onClick={() => approve.mutate()} disabled={approve.isPending}>
								<CheckIcon />
								Accept
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => reject.mutate()} disabled={reject.isPending}>
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
		</>
	);
}
