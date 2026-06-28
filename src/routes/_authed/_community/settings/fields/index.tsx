import {
	addOrganizationCustomField,
	deleteOrganizationCustomField,
	getOrganizationCustomFieldsQuery,
} from "@/api/fields";
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
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { CUSTOM_FIELD_TYPE } from "@/db/constants";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/_authed/_community/settings/fields/")({
	component: RouteComponent,
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(getOrganizationCustomFieldsQuery());
	},
});

function PageHeader() {
	return (
		<div className="flex flex-row items-center justify-start gap-2">
			<SidebarTrigger />
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink render={<Route.Link to={"/dashboard"} />}>Home</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbLink render={<Route.Link to={"/settings/overview"} />}>
							Settings
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

function AddFieldDrawer() {
	const [open, setOpen] = useState(false);

	const form = useForm<z.infer<typeof addFieldSchema>>({
		resolver: zodResolver(addFieldSchema),
		defaultValues: {
			label: "",
			type: CUSTOM_FIELD_TYPE.text,
		},
	});

	const { mutate: addField, isPending } = useMutation({
		mutationFn: addOrganizationCustomField,
		onSuccess: (_d, _v, _r, context) => {
			toast.success("Field added successfully");
			form.reset();
			setOpen(false);
			context.client.invalidateQueries({
				queryKey: getOrganizationCustomFieldsQuery().queryKey,
			});
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	const onSubmit = form.handleSubmit((values) => {
		addField({ data: values });
	});

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger render={<Button size="sm" />}>
				<Plus className="size-4" />
				Add Field
			</SheetTrigger>
			<SheetContent side="right" className="overflow-y-auto">
				<SheetHeader>
					<SheetTitle>Add New Field</SheetTitle>
					<SheetDescription>
						Add an extra field captured on every community profile.
					</SheetDescription>
				</SheetHeader>
				<Form {...form}>
					<form onSubmit={onSubmit} className="flex flex-1 flex-col gap-4 px-6">
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
						<SheetFooter className="px-0">
							<Button type="submit" disabled={isPending}>
								{isPending ? "Adding..." : "Add Field"}
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

function DeleteFieldDialog({ id }: { id: string }) {
	const [open, setOpen] = useState(false);

	const { mutate: deleteField, isPending: isDeleting } = useMutation({
		mutationFn: deleteOrganizationCustomField,
		onSuccess: (_d, _v, _r, context) => {
			toast.success("Field deleted successfully");
			setOpen(false);
			context.client.invalidateQueries({
				queryKey: getOrganizationCustomFieldsQuery().queryKey,
			});
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	return (
		<AlertDialog open={open} onOpenChange={setOpen}>
			<AlertDialogTrigger render={<Button variant="destructive" size="icon-sm" />}>
				<Trash2 className="size-4" />
				<span className="sr-only">Delete field</span>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete field?</AlertDialogTitle>
					<AlertDialogDescription>
						This will permanently delete this field. This action cannot be undone.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						disabled={isDeleting}
						onClick={(e) => {
							e.preventDefault();
							deleteField({ data: { fieldId: id } });
						}}
					>
						{isDeleting ? "Deleting..." : "Delete"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

function FieldsTable() {
	const { data } = useSuspenseQuery(getOrganizationCustomFieldsQuery());

	const fields = data?.data ?? [];

	return (
		<div className="w-full overflow-x-auto rounded-lg border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Label</TableHead>
						<TableHead>Type</TableHead>
						<TableHead className="text-right">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{fields.length === 0 ? (
						<TableRow>
							<TableCell colSpan={3} className="text-center text-muted-foreground">
								No fields yet. Add one to get started.
							</TableCell>
						</TableRow>
					) : (
						fields.map((field) => (
							<TableRow key={field.id}>
								<TableCell aria-label="Field Label">{field.label}</TableCell>
								<TableCell aria-label="Field Type" className="capitalize">
									{field.type}
								</TableCell>
								<TableCell className="text-right">
									<DeleteFieldDialog id={field.id} />
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
					<h2 className="text-lg font-medium">Custom Fields</h2>
					<p className="text-sm text-muted-foreground">
						Manage the extra fields captured on every community member's profile.
					</p>
				</div>
				<AddFieldDrawer />
			</div>
			<FieldsTable />
		</div>
	);
}
