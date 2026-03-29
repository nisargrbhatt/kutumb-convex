import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";

export const Route = createFileRoute("/_authed/_community/settings/overview")({
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
						<BreadcrumbPage>Overview</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
		</div>
	);
}

const formSchema = z.object({
	name: z
		.string()
		.trim()
		.min(3, "Organization name must be at least 3 characters.")
		.max(10, "Organization name must be at most 10 characters.")
		.regex(
			/^[a-zA-Z0-9_]+$/,
			"Organization name can only contain letters, numbers, and underscores."
		),
});

function OrganizationForm(props: { name: string; slug: string; organizationId: string }) {
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: props?.name,
		},
	});

	const onSubmit = form.handleSubmit(async (values) => {
		const { data, error } = await authClient.organization.update({
			organizationId: props.organizationId,
			data: {
				name: values.name,
			},
		});

		if (!data) {
			console.error(error);
			toast.error("Failed to update organization", {
				description: "Please try again later.",
			});
			return;
		}

		toast.success("Organization", {
			description: "Organization updated successfully",
		});
	});

	return (
		<Form {...form}>
			<form onSubmit={onSubmit} className="w-full">
				<div className="grid w-full grid-cols-1 gap-2 pb-2 sm:grid-cols-2">
					<FormField
						control={form.control}
						name="name"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Name</FormLabel>
								<FormControl>
									<Input type="text" placeholder="Org Name" {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<Field>
						<FieldLabel>Slug</FieldLabel>
						<Input type="text" placeholder="Org slug" value={props.slug} disabled />
					</Field>
				</div>
				<Button type="submit" disabled={form.formState.isSubmitting}>
					Save
				</Button>
			</form>
		</Form>
	);
}

function RouteComponent() {
	const { data: activeOrg } = authClient.useActiveOrganization();
	return (
		<div className="flex h-full w-full flex-col items-start justify-start gap-4 p-2">
			<PageHeader />
			{activeOrg ? (
				<OrganizationForm
					name={activeOrg?.name}
					slug={activeOrg?.slug}
					organizationId={activeOrg.id}
				/>
			) : null}
		</div>
	);
}
