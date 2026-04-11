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
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemMedia,
	ItemTitle,
} from "@/components/ui/item";
import { BookKeyIcon, CrownIcon, UserIcon } from "lucide-react";
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
import { Card, CardAction, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useId } from "react";
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

function AddOrganizationMemberForm() {
	const formId = useId();
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
	});

	return (
		<Form {...form}>
			<form onSubmit={onSubmit} className="w-full max-w-md" id={formId}>
				<Card>
					<CardContent>
						<div className="flex flex-col items-start justify-start gap-2">
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
										<FormControl>
											<Select onValueChange={field.onChange} defaultValue={field.value}>
												<SelectTrigger>
													<SelectValue placeholder="Select a role" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value={ORGANIZATION_ROLES.admin}>Admin</SelectItem>
													<SelectItem value={ORGANIZATION_ROLES.member}>Member</SelectItem>
												</SelectContent>
											</Select>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
					</CardContent>
					<CardFooter>
						<CardAction>
							<Button type="submit" disabled={form.formState.isSubmitting} form={formId}>
								Add Member
							</Button>
						</CardAction>
					</CardFooter>
				</Card>
			</form>
		</Form>
	);
}

function OrganizationMemberList() {
	const { data: activeOrganization } = authClient.useActiveOrganization();
	const posthog = usePostHog();

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

	return (
		<div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
			{activeOrganization?.members?.map((member) => (
				<Item key={member.id} variant={"outline"}>
					<ItemMedia variant="icon" title={member.role}>
						{member.role === "owner" ? <CrownIcon aria-label="Owner" /> : null}
						{member.role === "admin" ? <BookKeyIcon aria-label="Manager" /> : null}
						{member.role === "member" ? <UserIcon aria-label="Member" /> : null}
					</ItemMedia>
					<ItemContent>
						<ItemTitle>{member.user?.name}</ItemTitle>
						<ItemDescription>{member?.user?.email}</ItemDescription>
					</ItemContent>
					<ItemActions>
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
										This action cannot be undone. This will permanently remove member from our
										organization.
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
					</ItemActions>
				</Item>
			))}
		</div>
	);
}

function RouteComponent() {
	return (
		<div className="flex h-full w-full flex-col items-start justify-start gap-4 p-2">
			<PageHeader />
			<AddOrganizationMemberForm />
			<OrganizationMemberList />
		</div>
	);
}
