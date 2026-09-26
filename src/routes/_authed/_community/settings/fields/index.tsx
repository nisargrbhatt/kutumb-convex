import { PageHeader } from "@/components/CommunityLayout/PageHeader";
import { customFieldsQuery, useCreateCustomField, useDeleteCustomField } from "@/queries/fields";
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
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

export const Route = createFileRoute("/_authed/_community/settings/fields/")({
	component: RouteComponent,
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(customFieldsQuery(context.organizationId));
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

	const addField = useCreateCustomField();

	const onSubmit = (values: z.infer<typeof addFieldSchema>) =>
		addField.mutate(values, {
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
					Add Field
				</Button>
			}
			title="Add New Field"
			description="Add an extra field captured on every community profile."
			form={form}
			onSubmit={onSubmit}
			submitLabel="Add Field"
			isPending={addField.isPending}
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

	const deleteField = useDeleteCustomField();

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
			onConfirm={() => deleteField.mutate(id, { onSuccess: () => setOpen(false) })}
			isPending={deleteField.isPending}
		/>
	);
}

function FieldsTable() {
	const { organizationId: orgId } = Route.useRouteContext();
	const { data: fields } = useSuspenseQuery(customFieldsQuery(orgId));

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
