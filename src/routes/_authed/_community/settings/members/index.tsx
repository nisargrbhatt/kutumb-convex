import { PageHeader } from "@/components/CommunityLayout/PageHeader";
import { createFileRoute } from "@tanstack/react-router";
import { useActor } from "@/hooks/useActor";
import { BookKeyIcon, CrownIcon, DeleteIcon, Plus, UserIcon } from "lucide-react";
import * as z from "zod";
import { ORGANIZATION_ROLES } from "@/db/constants";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { FormDrawer } from "@/components/ui/form-drawer";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useQuery } from "@tanstack/react-query";
import type { Role } from "@/domain/permission";
import { Spinner } from "@/components/ui/spinner";
import {
	orgInvitationsQuery,
	useCancelInvitation,
	useChangeRole,
	useInviteMember,
	useRemoveMember,
	useResendInvitation,
} from "@/queries/organization";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { IconReload } from "@tabler/icons-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authed/_community/settings/members/")({
	component: RouteComponent,
});

const formSchema = z.object({
	email: z.email().min(1, "Email is required"),
	role: z.enum([ORGANIZATION_ROLES.admin, ORGANIZATION_ROLES.member]),
});

const changeRoleSchema = z.object({
	role: z.enum([ORGANIZATION_ROLES.owner, ORGANIZATION_ROLES.admin, ORGANIZATION_ROLES.member]),
});

function AddMemberDrawer() {
	const [open, setOpen] = useState(false);
	const invite = useInviteMember();

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			email: "",
			role: ORGANIZATION_ROLES.member,
		},
	});

	const onSubmit = (values: z.infer<typeof formSchema>) =>
		invite.mutate(values, {
			onSuccess: () => {
				form.reset();
				setOpen(false);
			},
		});

	return (
		<FormDrawer
			open={open}
			onOpenChange={setOpen}
			trigger={
				<Button size="sm">
					<Plus className="size-4" />
					Add Member
				</Button>
			}
			title="Invite Member"
			description="Invite a new member to your organization by email."
			form={form}
			onSubmit={onSubmit}
			submitLabel="Invite"
			isPending={invite.isPending}
		>
			<FormField
				control={form.control}
				name="email"
				render={({ field }) => (
					<FormItem>
						<FormLabel>Email</FormLabel>
						<FormControl>
							<Input placeholder="Email" {...field} />
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>
			<FormField
				control={form.control}
				name="role"
				render={({ field }) => (
					<FormItem>
						<FormLabel>Role</FormLabel>
						<Select
							items={{
								[ORGANIZATION_ROLES.admin]: "Admin",
								[ORGANIZATION_ROLES.member]: "Member",
							}}
							onValueChange={field.onChange}
							defaultValue={field.value}
						>
							<FormControl>
								<SelectTrigger>
									<SelectValue placeholder="Select a role" />
								</SelectTrigger>
							</FormControl>
							<SelectContent>
								<SelectItem value={ORGANIZATION_ROLES.admin}>Admin</SelectItem>
								<SelectItem value={ORGANIZATION_ROLES.member}>Member</SelectItem>
							</SelectContent>
						</Select>
						<FormMessage />
					</FormItem>
				)}
			/>
		</FormDrawer>
	);
}

type OrganizationMember = NonNullable<
	ReturnType<typeof authClient.useActiveOrganization>["data"]
>["members"][number];

function ChangeRoleDrawer({ member }: { member: OrganizationMember }) {
	const [open, setOpen] = useState(false);
	const changeRole = useChangeRole();

	const form = useForm<z.infer<typeof changeRoleSchema>>({
		resolver: zodResolver(changeRoleSchema),
		defaultValues: {
			role: member.role as z.infer<typeof changeRoleSchema>["role"],
		},
	});

	useEffect(() => {
		if (open) {
			form.reset({ role: member.role as z.infer<typeof changeRoleSchema>["role"] });
		}
	}, [open, member.role, form]);

	const onSubmit = (values: z.infer<typeof changeRoleSchema>) =>
		changeRole.mutate(
			{ memberId: member.id, role: values.role },
			{ onSuccess: () => setOpen(false) }
		);

	return (
		<FormDrawer
			open={open}
			onOpenChange={setOpen}
			trigger={
				<Button variant="outline" size="sm" type="button">
					Change Role
				</Button>
			}
			title="Change Role"
			description={`Update the role for ${member.user?.name ?? member.user?.email}.`}
			form={form}
			onSubmit={onSubmit}
			submitLabel="Save"
			isPending={changeRole.isPending}
		>
			<FormField
				control={form.control}
				name="role"
				render={({ field }) => (
					<FormItem>
						<FormLabel>Role</FormLabel>
						<Select
							items={{
								[ORGANIZATION_ROLES.owner]: "Owner",
								[ORGANIZATION_ROLES.admin]: "Admin",
								[ORGANIZATION_ROLES.member]: "Member",
							}}
							onValueChange={field.onChange}
							value={field.value}
						>
							<FormControl>
								<SelectTrigger>
									<SelectValue placeholder="Select a role" />
								</SelectTrigger>
							</FormControl>
							<SelectContent>
								<SelectItem value={ORGANIZATION_ROLES.owner}>Owner</SelectItem>
								<SelectItem value={ORGANIZATION_ROLES.admin}>Admin</SelectItem>
								<SelectItem value={ORGANIZATION_ROLES.member}>Member</SelectItem>
							</SelectContent>
						</Select>
						<FormMessage />
					</FormItem>
				)}
			/>
		</FormDrawer>
	);
}

function OrganizationMemberList() {
	const { data: activeOrganization } = authClient.useActiveOrganization();
	const actor = useActor();

	const canRemove = actor?.role === "owner";

	const members = activeOrganization?.members ?? [];

	return (
		<div className="w-full overflow-x-auto rounded-lg border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Member</TableHead>
						<TableHead>Email</TableHead>
						<TableHead>Role</TableHead>
						<TableHead className="text-right">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{members.length === 0 ? (
						<TableRow>
							<TableCell colSpan={4} className="text-center text-muted-foreground">
								No members yet.
							</TableCell>
						</TableRow>
					) : (
						members.map((member) => (
							<TableRow key={member.id}>
								<TableCell>{member.user?.name}</TableCell>
								<TableCell>{member.user?.email}</TableCell>
								<TableCell>
									<span className="flex items-center gap-2 capitalize">
										{member.role === "owner" ? (
											<CrownIcon className="size-4" aria-label="Owner" />
										) : null}
										{member.role === "admin" ? (
											<BookKeyIcon className="size-4" aria-label="Manager" />
										) : null}
										{member.role === "member" ? (
											<UserIcon className="size-4" aria-label="Member" />
										) : null}
										{member.role}
									</span>
								</TableCell>
								<TableCell className="text-right">
									{canRemove && member.user.id !== actor?.userId ? (
										<div className="flex items-center justify-end gap-2">
											<ChangeRoleDrawer member={member} />
											<RemoveMemberDialog memberId={member.id} />
										</div>
									) : (
										<span className="text-muted-foreground">-</span>
									)}
								</TableCell>
							</TableRow>
						))
					)}
				</TableBody>
			</Table>
		</div>
	);
}

function RemoveMemberDialog({ memberId }: { memberId: string }) {
	const [open, setOpen] = useState(false);
	const removeMember = useRemoveMember();

	return (
		<ConfirmDialog
			open={open}
			onOpenChange={setOpen}
			trigger={
				<Button variant="outline" size="sm" type="button">
					Remove
				</Button>
			}
			title="Remove member?"
			description="This action cannot be undone. This will permanently remove the member from your organization."
			confirmLabel="Remove"
			destructive
			isPending={removeMember.isPending}
			onConfirm={() => removeMember.mutate(memberId, { onSuccess: () => setOpen(false) })}
		/>
	);
}

function OrganizationInviteList() {
	const { organizationId: orgId } = Route.useRouteContext();
	const { data: activeOrg } = authClient.useActiveOrganization();
	const { data, isLoading, error } = useQuery(orgInvitationsQuery(orgId));
	const cancelInvite = useCancelInvitation();
	const resendInvite = useResendInvitation();

	useEffect(() => {
		if (error) {
			console.error(error);
		}
	}, [error]);

	if (isLoading) {
		return (
			<div className="flex items-center justify-center gap-2">
				<Spinner />
				<p>Loading...</p>
			</div>
		);
	}

	const invites = data ?? [];

	return (
		<div className="w-full overflow-x-auto rounded-lg border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Email</TableHead>
						<TableHead>Role</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Inviter</TableHead>
						<TableHead>Expires At</TableHead>
						<TableHead>Created At</TableHead>
						<TableHead className="text-right">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{invites.length === 0 ? (
						<TableRow>
							<TableCell colSpan={7} className="text-center text-muted-foreground">
								No pending invites.
							</TableCell>
						</TableRow>
					) : (
						invites.map((i) => (
							<TableRow key={i.id}>
								<TableCell>{i.email}</TableCell>
								<TableCell className="capitalize">{i.role}</TableCell>
								<TableCell className="capitalize">{i.status}</TableCell>
								<TableCell>
									{activeOrg?.members?.find((m) => m.user.id === i.inviterId)?.user?.name ?? "-"}
								</TableCell>
								<TableCell title={new Date(i.expiresAt).toString()}>
									{new Date(i.expiresAt).toDateString()}
								</TableCell>
								<TableCell title={new Date(i.createdAt).toString()}>
									{new Date(i.createdAt).toDateString()}
								</TableCell>
								<TableCell className="text-right">
									{i.status === "pending" ? (
										<Button
											type="button"
											variant={"ghost"}
											size={"icon-sm"}
											disabled={cancelInvite.isPending}
											onClick={() => cancelInvite.mutate(i.id)}
											title="Cancel Invite"
										>
											<DeleteIcon />
										</Button>
									) : null}{" "}
									{i.status === "pending" ? (
										<Button
											type="button"
											variant={"ghost"}
											size={"icon-sm"}
											disabled={resendInvite.isPending}
											onClick={() =>
												resendInvite.mutate({ id: i.id, email: i.email, role: i.role as Role })
											}
											title="Resend Invite"
										>
											<IconReload />
										</Button>
									) : null}
								</TableCell>
							</TableRow>
						))
					)}
				</TableBody>
			</Table>
		</div>
	);
}

function RouteComponent() {
	return (
		<div className="flex h-full w-full flex-col items-start justify-start gap-4 p-2">
			<PageHeader
				crumbs={[{ label: "Settings", to: "/settings/overview" }, { label: "Members" }]}
				title="Members"
				description="Manage your organization members and pending invitations."
				actions={<AddMemberDrawer />}
			/>
			<Tabs defaultValue="members" className="w-full">
				<TabsList className="w-full">
					<TabsTrigger value="members">Members</TabsTrigger>
					<TabsTrigger value="invites">Invites</TabsTrigger>
				</TabsList>
				<TabsContent value="members">
					<OrganizationMemberList />
				</TabsContent>
				<TabsContent value="invites">
					<OrganizationInviteList />
				</TabsContent>
			</Tabs>
		</div>
	);
}
