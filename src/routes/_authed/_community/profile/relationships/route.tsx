import {
	addMyCommunityRelationship,
	deleteMyCommunityRelationship,
	getMyCommunityRelationshipsQuery,
} from "@/api/communityRelation";
import { getCommunityProfileListQuery } from "@/api/communityProfile";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";

import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemHeader,
	ItemTitle,
} from "@/components/ui/item";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import { COMMUNITY_RELATION_TYPE } from "@/db/constants";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Trash2, Users } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_authed/_community/profile/relationships")({
	loader: async ({ context }) => {
		await Promise.allSettled([
			context.queryClient.ensureQueryData(getMyCommunityRelationshipsQuery()),
			context.queryClient.ensureQueryData(getCommunityProfileListQuery()),
		]);
	},
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
							<Route.Link to={"/profile/info"}>Profile</Route.Link>
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>Relationships</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
		</div>
	);
}

const relationshipFormSchema = z.object({
	type: z.enum([
		COMMUNITY_RELATION_TYPE.brother,
		COMMUNITY_RELATION_TYPE.brother_in_law,
		COMMUNITY_RELATION_TYPE.child,
		COMMUNITY_RELATION_TYPE.father,
		COMMUNITY_RELATION_TYPE.father_in_law,
		COMMUNITY_RELATION_TYPE.mother,
		COMMUNITY_RELATION_TYPE.mother_in_law,
		COMMUNITY_RELATION_TYPE.sister,
		COMMUNITY_RELATION_TYPE.sister_in_law,
		COMMUNITY_RELATION_TYPE.wife,
		COMMUNITY_RELATION_TYPE.husband,
		COMMUNITY_RELATION_TYPE.uncle,
		COMMUNITY_RELATION_TYPE.aunt,
	]),
	toId: z.string().min(1, "Target profile is required"),
	note: z.string().optional(),
	bloodRelation: z.boolean().default(false).optional(),
});

function RouteComponent() {
	const [isAddOpen, setIsAddOpen] = useState(false);

	const { data: relationships } = useSuspenseQuery(getMyCommunityRelationshipsQuery());

	const { mutate: deleteRelationship, isPending: isDeleting } = useMutation({
		mutationFn: deleteMyCommunityRelationship,
		onSuccess: (_d, _v, _r, context) => {
			toast.success("Relationship deleted successfully");
			context.client.invalidateQueries({
				queryKey: getMyCommunityRelationshipsQuery().queryKey,
			});
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	return (
		<div className="flex h-full w-full flex-col items-start justify-start gap-4 p-2">
			<PageHeader />
			<div className="flex w-full flex-col gap-6 pt-4">
				<div className="flex items-center justify-between">
					<div>
						<h2 className="text-lg font-medium">Relationships</h2>
						<p className="text-sm text-muted-foreground">
							Manage your family and community relationships.
						</p>
					</div>
					<RelationshipFormModal open={isAddOpen} onOpenChange={setIsAddOpen} />
				</div>

				<div className="grid gap-4 md:grid-cols-2">
					{relationships.length === 0 ? (
						<div className="col-span-full flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center text-muted-foreground">
							<Users className="size-8 text-muted-foreground/50" />
							<p>No relationships found.</p>
						</div>
					) : (
						relationships.map((rel) => {
							const targetProfile = rel.toCommunityProfile;
							const targetName = targetProfile
								? [targetProfile.firstName, targetProfile.middleName, targetProfile.lastName]
										.filter(Boolean)
										.join(" ")
								: "Unknown";

							return (
								<Item variant={"outline"} key={rel.id} className="items-start shadow-xs">
									<ItemContent>
										<ItemHeader>
											<ItemTitle>
												<div className="flex flex-col items-start gap-1">
													<span className="capitalize">{(rel.type || "").replace(/_/g, " ")}</span>
													{rel.bloodRelation && (
														<span className="text-xs font-medium text-destructive">
															Blood Relation
														</span>
													)}
												</div>
											</ItemTitle>
											<ItemActions>
												<Button
													variant="destructive"
													size="icon-sm"
													disabled={isDeleting}
													onClick={() => {
														deleteRelationship({ data: { id: rel.id } });
													}}
												>
													<Trash2 className="size-4" />
													<span className="sr-only">Delete relationship</span>
												</Button>
											</ItemActions>
										</ItemHeader>
										<ItemDescription className="mt-2 text-foreground">
											<div className="grid grid-cols-[100px_1fr] gap-2 border-b border-border py-2 text-sm last:border-0">
												<span className="font-medium text-muted-foreground">Relative</span>
												<span>
													{targetName}{" "}
													{targetProfile?.nickName ? `(${targetProfile.nickName})` : ""}
												</span>
											</div>
											<div className="grid grid-cols-[100px_1fr] gap-2 border-b border-border py-2 text-sm last:border-0">
												<span className="font-medium text-muted-foreground">Note</span>
												<span>{rel.note || "-"}</span>
											</div>
										</ItemDescription>
									</ItemContent>
								</Item>
							);
						})
					)}
				</div>
			</div>
		</div>
	);
}

function RelationshipFormModal({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { data: profiles } = useSuspenseQuery(getCommunityProfileListQuery());

	const form = useForm<z.infer<typeof relationshipFormSchema>>({
		resolver: zodResolver(relationshipFormSchema),
		defaultValues: {
			type: COMMUNITY_RELATION_TYPE.brother,
			toId: "",
			note: "",
			bloodRelation: false,
		},
	});

	const { mutate: addRelationship, isPending } = useMutation({
		mutationFn: addMyCommunityRelationship,
		onSuccess: (_d, _v, _r, context) => {
			toast.success("Relationship added successfully");
			form.reset();
			onOpenChange(false);
			context.client.invalidateQueries({
				queryKey: getMyCommunityRelationshipsQuery().queryKey,
			});
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	function onSubmit(values: z.infer<typeof relationshipFormSchema>) {
		addRelationship({
			data: values,
		});
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogTrigger asChild>
				<Button size="sm">
					<Users className="mr-2 size-4" />
					Add Relationship
				</Button>
			</DialogTrigger>
			<DialogContent className="h-[90vh] max-w-2xl overflow-y-auto sm:max-w-[500px] md:h-auto">
				<div className="flex flex-col space-y-1.5 p-6 pb-2">
					<h2 className="text-2xl leading-none font-semibold tracking-tight">Relationship form</h2>
					<p className="text-sm text-muted-foreground">Add your relative to your profile</p>
				</div>
				<div className="p-6 pt-0">
					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
							<div className="grid grid-cols-1 gap-4">
								<FormField
									control={form.control}
									name="toId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Relative</FormLabel>
											<Select onValueChange={field.onChange} defaultValue={field.value}>
												<FormControl>
													<SelectTrigger>
														<SelectValue placeholder="Select a community member" />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													{profiles.map((profile) => (
														<SelectItem key={profile.id} value={profile.id}>
															{[profile.firstName, profile.middleName, profile.lastName]
																.filter(Boolean)
																.join(" ")}{" "}
															{profile.nickName ? `(${profile.nickName})` : ""}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="type"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Relation Type</FormLabel>
											<Select onValueChange={field.onChange} defaultValue={field.value}>
												<FormControl>
													<SelectTrigger>
														<SelectValue placeholder="Select relation type" />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													{Object.values(COMMUNITY_RELATION_TYPE).map((type) => (
														<SelectItem key={type} value={type} className="capitalize">
															{type.replace(/_/g, " ")}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="bloodRelation"
									render={({ field }) => (
										<FormItem className="flex flex-row items-start space-y-0 space-x-3 rounded-md border p-4">
											<FormControl>
												<Checkbox checked={field.value} onCheckedChange={field.onChange} />
											</FormControl>
											<div className="space-y-1 leading-none">
												<FormLabel>Blood Relation</FormLabel>
												<FormDescription>Is this person related to you by blood?</FormDescription>
											</div>
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="note"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Note</FormLabel>
											<FormControl>
												<Textarea placeholder="Note" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>

							<div className="flex justify-end gap-2 pt-4">
								<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
									Cancel
								</Button>
								<Button type="submit" disabled={isPending}>
									{isPending ? "Adding..." : "Add Relationship"}
								</Button>
							</div>
						</form>
					</Form>
				</div>
			</DialogContent>
		</Dialog>
	);
}
