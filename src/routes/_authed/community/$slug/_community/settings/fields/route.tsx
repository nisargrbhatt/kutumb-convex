import { addOrganizationCustomField, getOrganizationCustomFields } from "@/api/fields";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { CUSTOM_FIELD_TYPE } from "@/db/constants";
import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

export const Route = createFileRoute("/_authed/community/$slug/_community/settings/fields")({
	component: RouteComponent,
	loader: async ({ context, abortController }) => {
		const customFields = await getOrganizationCustomFields({
			data: {
				organizationId: context.organization.id,
			},
			signal: abortController.signal,
		});

		return {
			customFields: customFields.data,
			organizationId: context.organization.id,
		};
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
						<BreadcrumbPage>Fields</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
		</div>
	);
}

const addFieldSchema = z.object({
	label: z.string().min(1, "Label is required"),
	type: z.enum([
		CUSTOM_FIELD_TYPE.text,
		CUSTOM_FIELD_TYPE.number,
		CUSTOM_FIELD_TYPE.date,
		CUSTOM_FIELD_TYPE.boolean,
	]),
});

function AddFieldForm() {
	const { organizationId } = Route.useLoaderData();

	const form = useForm<z.infer<typeof addFieldSchema>>({
		resolver: zodResolver(addFieldSchema),
		defaultValues: {
			label: "",
			type: CUSTOM_FIELD_TYPE.text,
		},
	});

	const onSubmit = form.handleSubmit(async (values) => {
		await addOrganizationCustomField({
			data: {
				organizationId: organizationId,
				...values,
			},
		});
	});

	return (
		<div className="w-full max-w-md rounded-lg border p-4">
			<h3 className="mb-4 text-lg font-medium">Add New Field</h3>
			<Form {...form}>
				<form onSubmit={onSubmit} className="space-y-4">
					<FormField
						control={form.control}
						name="label"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Label</FormLabel>
								<FormControl>
									<Input placeholder="e.g. Birthdate" {...field} />
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
								<FormLabel>Type</FormLabel>
								<Select onValueChange={field.onChange} defaultValue={field.value}>
									<FormControl>
										<SelectTrigger>
											<SelectValue placeholder="Select a type" />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										{Object.values(CUSTOM_FIELD_TYPE).map((type) => (
											<SelectItem key={type} value={type} className="capitalize">
												{type}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<FormMessage />
							</FormItem>
						)}
					/>
					<Button type="submit">Add Field</Button>
				</form>
			</Form>
		</div>
	);
}

function FieldsList() {
	const { customFields } = Route.useLoaderData();

	return (
		<div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
			{customFields.map((field) => (
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
		<div className="flex h-full w-full flex-col items-start justify-start gap-4 p-2">
			<PageHeader />
			<AddFieldForm />
			<div className="w-full">
				<h3 className="mb-2 text-lg font-medium">Existing Fields</h3>
				<FieldsList />
			</div>
		</div>
	);
}
