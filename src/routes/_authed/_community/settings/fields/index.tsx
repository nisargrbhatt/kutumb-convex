import { PageHeader } from "@/components/CommunityLayout/PageHeader";
import { addOrganizationCustomField, deleteOrganizationCustomField } from "@/server/fields";
import { getOrganizationCustomFieldsQuery } from "@/queries/fields";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
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

	const onSubmit = (values: z.infer<typeof addFieldSchema>) => addField({ data: values });

	return (
		<FormDrawer
			open={open}
			onOpenChange={setOpen}
			trigger={
				<Button size="sm">
					<Plus className="size-4" />
					Add Field
				</Button>
			}
			title="Add New Field"
			description="Add an extra field captured on every community profile."
			form={form}
			onSubmit={onSubmit}
			submitLabel="Add Field"
			isPending={isPending}
		>
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
		</FormDrawer>
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
		<ConfirmDialog
			open={open}
			onOpenChange={setOpen}
			trigger={
				<Button variant="destructive" size="icon-sm" aria-label="Delete field">
					<Trash2 className="size-4" />
				</Button>
			}
			title="Delete field?"
			description="This will permanently delete this field. This action cannot be undone."
			confirmLabel="Delete"
			destructive
			onConfirm={() => deleteField({ data: { fieldId: id } })}
			isPending={isDeleting}
		/>
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
			<PageHeader
				crumbs={[{ label: "Settings", to: "/settings/overview" }, { label: "Fields" }]}
				title="Custom Fields"
				description="Manage the extra fields captured on every community member's profile."
				actions={<AddFieldDrawer />}
			/>
			<FieldsTable />
		</div>
	);
}
