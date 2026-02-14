import { getOrganizationInfoQuery, updateOrganizationInfo } from "@/api/organization";
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
import { Textarea } from "@/components/ui/textarea";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";

export const Route = createFileRoute("/_authed/community/$slug/_community/settings/overview")({
	component: RouteComponent,
	loader: async ({ context, params }) => {
		await context.queryClient.ensureQueryData(
			getOrganizationInfoQuery({
				slug: params.slug,
			})
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
						<BreadcrumbPage>Overview</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
		</div>
	);
}

const formSchema = z.object({
	description: z.string().min(1, "Organization description is required"),
});

function OrganizationForm() {
	const { slug } = Route.useParams();
	const { data } = useSuspenseQuery(getOrganizationInfoQuery({ slug }));

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			description: data?.description,
		},
	});

	const onSubmit = form.handleSubmit(async (values) => {
		await updateOrganizationInfo({
			data: {
				slug: slug,
				organization: values,
			},
		});

		toast.success("Organization", {
			description: "Organization updated successfully",
		});
	});

	return (
		<Form {...form}>
			<form onSubmit={onSubmit} className="w-full">
				<div className="grid w-full grid-cols-1 gap-2 pb-2 sm:grid-cols-2">
					<Field>
						<FieldLabel>Name</FieldLabel>
						<Input type="text" placeholder="Org Name" value={data.name} disabled />
					</Field>
					<Field>
						<FieldLabel>Slug</FieldLabel>
						<Input type="text" placeholder="Org slug" value={data.slug} disabled />
					</Field>
					<FormField
						control={form.control}
						name="description"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Description</FormLabel>
								<FormControl>
									<Textarea placeholder="e.g. Community for Tom and Jerry fans" {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
				</div>
				<Button type="submit" disabled={form.formState.isSubmitting}>
					Save
				</Button>
			</form>
		</Form>
	);
}

function RouteComponent() {
	return (
		<div className="flex h-full w-full flex-col items-start justify-start gap-4 p-2">
			<PageHeader />
			<OrganizationForm />
		</div>
	);
}
