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
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";
import { usePostHog } from "@posthog/react";

export const Route = createFileRoute("/_authed/_community/settings/overview/")({
	component: RouteComponent,
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
	const posthog = usePostHog();
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

		posthog.capture("organization_settings_updated", {
			organization_id: props.organizationId,
		});
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

function DeleteOrganizationDialog(props: { organizationId: string; name: string }) {
	const posthog = usePostHog();
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	const handleDelete = async () => {
		setIsDeleting(true);
		const { error } = await authClient.organization.delete({
			organizationId: props.organizationId,
		});

		if (error) {
			console.error(error);
			toast.error("Failed to delete organization", {
				description: "Please try again later.",
			});
			setIsDeleting(false);
			return;
		}

		posthog.capture("organization_deleted", {
			organization_id: props.organizationId,
		});
		toast.success("Organization", {
			description: "Organization deleted successfully",
		});
		setOpen(false);
		await router.invalidate();
		router.navigate({ to: "/onboarding/create" });
	};

	return (
		<AlertDialog open={open} onOpenChange={setOpen}>
			<AlertDialogTrigger render={<Button variant="destructive" />}>
				Delete Organization
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete {props.name}?</AlertDialogTitle>
					<AlertDialogDescription>
						This will permanently delete this organization and all its data, including members,
						profiles, and billing records. This action cannot be undone.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						disabled={isDeleting}
						onClick={(e) => {
							e.preventDefault();
							handleDelete();
						}}
					>
						{isDeleting ? "Deleting..." : "Delete"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

function DangerZone(props: { organizationId: string; name: string }) {
	const { data: activeMemberRole } = authClient.useActiveMemberRole();

	if (activeMemberRole?.role !== "owner") {
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
				<DeleteOrganizationDialog organizationId={props.organizationId} name={props.name} />
			</div>
		</div>
	);
}

function RouteComponent() {
	const { data: activeOrg } = authClient.useActiveOrganization();
	return (
		<div className="flex h-full w-full flex-col items-start justify-start gap-4 p-2">
			<PageHeader />
			{activeOrg ? (
				<>
					<OrganizationForm
						name={activeOrg?.name}
						slug={activeOrg?.slug}
						organizationId={activeOrg.id}
					/>
					<DangerZone organizationId={activeOrg.id} name={activeOrg.name} />
				</>
			) : null}
		</div>
	);
}
