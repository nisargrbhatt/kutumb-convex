import { SidebarTrigger } from "@/components/ui/sidebar";
import { createFileRoute } from "@tanstack/react-router";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { getOrganizationCustomFields } from "@/api/fields";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authed/community/$slug/_community/settings/fields")({
	component: RouteComponent,
	loader: async ({ context, abortController }) =>
		await getOrganizationCustomFields({
			data: {
				organizationId: context.organization.id,
			},
			signal: abortController.signal,
		}),
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
						<BreadcrumbPage>Fields</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
		</div>
	);
}

function FieldsList() {
	const { data } = Route.useLoaderData();

	return (
		<div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
			{data.map((field) => (
				<Item key={field.id} className="w-full" variant="outline">
					<ItemContent>
						<ItemTitle aria-label="Field Label">{field.label}</ItemTitle>
						<ItemDescription aria-label="Field Type" className="capitalize">
							{field.type}
						</ItemDescription>
					</ItemContent>
					<ItemActions>
						<Button variant="outline" size="sm">
							<Trash2 />
							Delete
						</Button>
					</ItemActions>
				</Item>
			))}
		</div>
	);
}

function RouteComponent() {
	return (
		<div className="flex h-full w-full flex-col items-start justify-start gap-1 p-2">
			<PageHeader />
			<FieldsList />
		</div>
	);
}
