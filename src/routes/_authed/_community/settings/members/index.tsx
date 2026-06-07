import { createFileRoute } from "@tanstack/react-router";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { BookKeyIcon, CrownIcon, DeleteIcon, Plus, UserIcon } from "lucide-react";
import * as z from "zod";
import { ORGANIZATION_ROLES } from "@/db/constants";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { usePostHog } from "@posthog/react";
import { useQuery } from "@tanstack/react-query";
import { Spinner } from "@/components/ui/spinner";
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

function PageHeader() {
	return (
		<div className="flex flex-row items-center justify-start gap-2">
			<SidebarTrigger />
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink asChild>
							<Route.Link to={"/dashboard"}>Home</Route.Link>
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbLink asChild>
							<Route.Link to={"/settings/overview"}>Settings</Route.Link>
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>Members</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
		</div>
	);
}

const formSchema = z.object({
	email: z.email().min(1, "Email is required"),
	role: z.enum([ORGANIZATION_ROLES.admin, ORGANIZATION_ROLES.member]),
});

function AddMemberDrawer() {
	const [open, setOpen] = useState(false);
	const posthog = usePostHog();

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			email: "",
			role: ORGANIZATION_ROLES.member,
		},
	});

	const onSubmit = form.handleSubmit(async (values) => {
		const { error } = await authClient.organization.inviteMember({
			role: values.role,
			email: values.email,
			resend: true,
		});

		if (error) {
			console.error(error);
			toast.error("Member", {
				description: "Member could not be invited",
			});
			return;
		}
		posthog.capture("org_member_invited", {
			role: values.role,
		});
		toast.success("Member", {
			description: "Member invited successfully",
		});
		form.reset();
		setOpen(false);
	});

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>
				<Button size="sm">
					<Plus className="size-4" />
					Add Member
				</Button>
			</SheetTrigger>
			<SheetContent side="right" className="overflow-y-auto">
				<SheetHeader>
					<SheetTitle>Invite Member</SheetTitle>
					<SheetDescription>Invite a new member to your organization by email.</SheetDescription>
				</SheetHeader>
				<Form {...form}>
					<form onSubmit={onSubmit} className="flex flex-1 flex-col gap-4 px-6">
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
									<Select onValueChange={field.onChange} defaultValue={field.value}>
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
						<SheetFooter className="px-0">
							<Button type="submit" disabled={form.formState.isSubmitting}>
								{form.formState.isSubmitting ? "Inviting..." : "Invite"}
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

function OrganizationMemberList() {
	const { data: activeOrganization } = authClient.useActiveOrganization();
	const { data: session } = authClient.useSession();
	const posthog = usePostHog();

	const currentUserId = session?.user?.id;
	const currentRole = activeOrganization?.members?.find((m) => m.user.id === currentUserId)?.role;
	const canRemove = currentRole === "owner";

	const handleRemoveFromOrg = async (memberId: string) => {
		const { error } = await authClient.organization.removeMember({
			memberIdOrEmail: memberId,
		});

		if (error) {
			console.error(error);
			toast.error("Member", {
				description: error?.message ?? "Member could not be removed",
			});
			return;
		}
		posthog.capture("org_member_removed", { member_id: memberId });
		toast.success("Member", {
			description: "Member removed successfully",
		});
	};

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
									{canRemove && member.user.id !== currentUserId ? (
										<AlertDialog>
											<AlertDialogTrigger asChild>
												<Button variant="outline" size="sm" type="button">
													Remove
												</Button>
											</AlertDialogTrigger>
											<AlertDialogContent>
												<AlertDialogHeader>
													<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
													<AlertDialogDescription>
														This action cannot be undone. This will permanently remove member from
														our organization.
													</AlertDialogDescription>
												</AlertDialogHeader>
												<AlertDialogFooter>
													<AlertDialogCancel>Cancel</AlertDialogCancel>
													<AlertDialogAction
														onClick={() => {
															handleRemoveFromOrg(member.id);
														}}
													>
														Continue
													</AlertDialogAction>
												</AlertDialogFooter>
											</AlertDialogContent>
										</AlertDialog>
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

function OrganizationInviteList() {
	const posthog = usePostHog();
	const { data: activeOrg } = authClient.useActiveOrganization();
	const { data, isLoading, error, refetch } = useQuery({
		queryKey: ["org_invites"],
		queryFn: async () => {
			const { data, error } = await authClient.organization.listInvitations();

			if (error) {
				throw error;
			}

			return data;
		},
	});

	useEffect(() => {
		if (error) {
			console.error(error);
		}
	}, [error]);

	const deleteInvite = async (inviteId: string) => {
		const { error } = await authClient.organization.cancelInvitation({
			invitationId: inviteId,
		});

		if (error) {
			console.error(error);
			toast.error("Invitation", {
				description: error?.message ?? "Invitation could not be cancelled",
			});
			return;
		}

		toast.success("Invitation", {
			description: "Invitation cancelled successfully",
		});
		refetch();
	};

	const resendInvite = async (inviteId: string) => {
		const inviteObj = data?.find((i) => i.id === inviteId);

		if (!inviteObj) {
			return;
		}

		const { error } = await authClient.organization.inviteMember({
			resend: true,
			email: inviteObj.email,
			role: inviteObj.role,
		});

		if (error) {
			console.error(error);
			toast.error("Invitation", {
				description: error?.message ?? "Invitation could not be resent",
			});
			return;
		}

		toast.success("Invitation", {
			description: "Invitation resent successfully",
		});
		posthog.capture("org_member_invite_resend", {
			inviteId: inviteId,
		});
		refetch();
	};

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
											onClick={() => {
												deleteInvite(i.id);
											}}
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
											onClick={() => {
												resendInvite(i.id);
											}}
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
			<PageHeader />
			<div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h2 className="text-lg font-medium">Members</h2>
					<p className="text-sm text-muted-foreground">
						Manage your organization members and pending invitations.
					</p>
				</div>
				<AddMemberDrawer />
			</div>
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
