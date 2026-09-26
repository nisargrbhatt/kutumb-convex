import { PageHeader } from "@/components/CommunityLayout/PageHeader";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { authClient } from "@/lib/auth-client";
import { useActor } from "@/hooks/useActor";
import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import z from "zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
	orgUsageQuery,
	useDeleteOrganization,
	useUpdateOrganization,
} from "@/queries/organization";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authed/_community/settings/overview/")({
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(orgUsageQuery(context.organizationId));
	},
	component: RouteComponent,
});

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

function OrganizationForm(props: { name: string; slug: string }) {
	const update = useUpdateOrganization();
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: props?.name,
		},
	});

	const onSubmit = form.handleSubmit((values) => update.mutateAsync(values).catch(() => {}));

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
				<Button type="submit" disabled={update.isPending}>
					Save
				</Button>
			</form>
		</Form>
	);
}

function DeleteOrganizationDialog(props: { name: string }) {
	const [open, setOpen] = useState(false);
	const deleteOrg = useDeleteOrganization();

	return (
		<ConfirmDialog
			open={open}
			onOpenChange={setOpen}
			trigger={<Button variant="destructive">Delete Organization</Button>}
			title={`Delete ${props.name}?`}
			description="This will permanently delete this organization and all its data, including members and profiles. This action cannot be undone."
			confirmLabel="Delete"
			destructive
			onConfirm={() => deleteOrg.mutate(undefined, { onSuccess: () => setOpen(false) })}
			isPending={deleteOrg.isPending}
		/>
	);
}

const usageTone = (used: number, limit: number) =>
	used >= limit ? "text-destructive" : used >= limit * 0.9 ? "text-amber-600" : "";

function UsageCard() {
	const { organizationId: orgId } = Route.useRouteContext();
	const { data: usage } = useSuspenseQuery(orgUsageQuery(orgId));
	const rows = [
		{ label: "Org Members", used: usage.members },
		{ label: "Community Profiles", used: usage.profiles },
	];

	return (
		<Card className="w-full">
			<CardHeader>
				<CardTitle>Usage</CardTitle>
				<CardDescription>Free plan limits for this organization.</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{rows.map((row) => (
					<Progress key={row.label} value={(row.used / usage.limit) * 100}>
						<ProgressLabel>{row.label}</ProgressLabel>
						<ProgressValue className={cn("font-mono", usageTone(row.used, usage.limit))}>
							{() => `${row.used} / ${usage.limit}`}
						</ProgressValue>
					</Progress>
				))}
			</CardContent>
		</Card>
	);
}

function DangerZone(props: { name: string }) {
	const actor = useActor();

	if (actor?.role !== "owner") {
		return null;
	}

	return (
		<div className="flex w-full flex-col gap-2 rounded-lg border border-destructive/50 p-4">
			<div>
				<h2 className="text-lg font-medium text-destructive">Danger Zone</h2>
				<p className="text-sm text-muted-foreground">
					Deleting the organization is permanent and cannot be undone.
				</p>
			</div>
			<div>
				<DeleteOrganizationDialog name={props.name} />
			</div>
		</div>
	);
}

function RouteComponent() {
	const { data: activeOrg } = authClient.useActiveOrganization();
	return (
		<div className="flex h-full w-full flex-col items-start justify-start gap-4 p-2">
			<PageHeader
				crumbs={[{ label: "Settings", to: "/settings/overview" }, { label: "Overview" }]}
			/>
			{activeOrg ? (
				<>
					<OrganizationForm name={activeOrg.name} slug={activeOrg.slug} />
					<UsageCard />
					<DangerZone name={activeOrg.name} />
				</>
			) : null}
		</div>
	);
}
