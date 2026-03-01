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
import { addOrganizationMember, getOrganizationMemberListQuery } from "@/api/organizationMember";
import { useQuery } from "@tanstack/react-query";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { BookKeyIcon, CrownIcon, UserIcon } from "lucide-react";
import z from "zod";
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

export const Route = createFileRoute("/_authed/community/$slug/_community/settings/members")({
	component: RouteComponent,
	loader: async ({ context, params }) => {
		await context.queryClient.ensureQueryData(
			getOrganizationMemberListQuery({ slug: params.slug })
		);
	},
});

function PageHeader() {
	return (
		<div className="flex flex-row items-center justify-start gap-2">
			<SidebarTrigger />
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink asChild>
							<Route.Link to={"/community/$slug/dashboard"}>Home</Route.Link>
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbLink asChild>
							<Route.Link to={"/community/$slug/settings/overview"}>Settings</Route.Link>
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
	role: z.enum([ORGANIZATION_ROLES.manager, ORGANIZATION_ROLES.member]),
});

function AddOrganizationMemberForm() {
	const formId = useId();
	const { slug } = Route.useParams();
	const { refetch } = useQuery(getOrganizationMemberListQuery({ slug: slug }));

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			email: "",
			role: ORGANIZATION_ROLES.member,
		},
	});

	const onSubmit = form.handleSubmit(async (values) => {
		try {
			await addOrganizationMember({
				data: {
					member: {
						email: values.email,
						role: values.role,
					},
					slug,
				},
			});
			toast.success("Member", {
				description: "Member added successfully",
			});
			form.reset();
		} catch (error) {
			console.error(error);
			toast.error("Member", {
				description: "Member could not be added",
			});
		} finally {
			refetch();
		}
	});

	return (
		<Form {...form}>
			<form onSubmit={onSubmit} className="w-full" id={formId}>
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
													<SelectItem value={ORGANIZATION_ROLES.manager}>Manager</SelectItem>
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
	const { slug } = Route.useParams();
	const { data } = useQuery(getOrganizationMemberListQuery({ slug }));

	return (
		<div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
			{data?.map((member) => (
				<Item key={member.id} variant={"outline"}>
					<ItemMedia variant="icon">
						{member.role === "owner" ? <CrownIcon aria-label="Owner" /> : null}
						{member.role === "manager" ? <BookKeyIcon aria-label="Manager" /> : null}
						{member.role === "member" ? <UserIcon aria-label="Member" /> : null}
					</ItemMedia>
					<ItemContent>
						<ItemTitle>{member.member?.displayName}</ItemTitle>
						<ItemDescription>{member?.member?.email}</ItemDescription>
					</ItemContent>
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
