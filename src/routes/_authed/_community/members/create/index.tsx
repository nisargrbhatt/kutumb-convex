import { PageHeader } from "@/components/CommunityLayout/PageHeader";
import { getOrganizationCustomFieldsQuery } from "@/queries/fields";
import { getOrgUsageQuery } from "@/queries/organization";
import { safeAsync } from "@/lib/safe";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { COMMUNITY_PROFILE_BLOOD_GROUP, GENDERS } from "@/db/constants";
import {
	communityProfileFormSchema,
	toFormValues,
	toInput,
	type CommunityProfileFormValues,
} from "@/domain/communityProfile";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
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
import { DatePicker } from "@/components/ui/date-picker";
import { CustomFieldsSection } from "@/components/custom-fields/CustomFieldsSection";
import type { CustomFieldDefinition } from "@/domain/customFields";
import { addMissingMember } from "@/server/communityProfile";
import { toast } from "sonner";
import { usePostHog } from "@posthog/react";

export const Route = createFileRoute("/_authed/_community/members/create/")({
	component: RouteComponent,
	beforeLoad: async ({ context }) => {
		await safeAsync(context.queryClient.ensureQueryData(getOrganizationCustomFieldsQuery()));
	},
});

function CommunityProfileForm({ customFields }: { customFields: CustomFieldDefinition[] }) {
	const navigate = Route.useNavigate();
	const posthog = usePostHog();
	const queryClient = useQueryClient();
	const form = useForm<CommunityProfileFormValues>({
		resolver: zodResolver(communityProfileFormSchema),
		defaultValues: toFormValues(null),
	});

	const onSubmit = form.handleSubmit(async (data) => {
		const result = await safeAsync(addMissingMember({ data: toInput(data) }));

		if (!result.success) {
			console.error(result.error);
			toast.error("Profile", {
				description: result.error?.message ?? "Failed to add member",
			});
			return;
		}

		posthog.capture("member_added", {});
		toast.success("Member", {
			description:
				"Member added successfully as a Draft Record. Owner/Admin will be notified to approve the profile.",
		});
		queryClient.invalidateQueries({ queryKey: getOrgUsageQuery().queryKey });
		navigate({ to: "/members" });
	});

	return (
		<Form {...form}>
			<form onSubmit={onSubmit} className="w-full space-y-6">
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					<FormField
						control={form.control}
						name="firstName"
						render={({ field }) => (
							<FormItem>
								<FormLabel>First Name</FormLabel>
								<FormControl>
									<Input placeholder="First Name" {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="middleName"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Middle Name</FormLabel>
								<FormControl>
									<Input placeholder="Middle Name" {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="lastName"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Last Name</FormLabel>
								<FormControl>
									<Input placeholder="Last Name" {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="nickName"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Nick Name</FormLabel>
								<FormControl>
									<Input placeholder="Nick Name" {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="gender"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Gender</FormLabel>
								<Select onValueChange={field.onChange} defaultValue={field.value}>
									<FormControl>
										<SelectTrigger>
											<SelectValue placeholder="Select Gender" />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										{Object.values(GENDERS).map((gender) => (
											<SelectItem key={gender} value={gender} className="capitalize">
												{gender}
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
						name="email"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Email</FormLabel>
								<FormControl>
									<Input placeholder="Email" {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="mobileNumber"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Mobile Number</FormLabel>
								<FormControl>
									<Input placeholder="Mobile Number" {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="bloodGroup"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Blood Group</FormLabel>
								<Select onValueChange={field.onChange} defaultValue={field.value}>
									<FormControl>
										<SelectTrigger>
											<SelectValue placeholder="Select Blood Group" />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										{Object.values(COMMUNITY_PROFILE_BLOOD_GROUP).map((bg) => (
											<SelectItem key={bg} value={bg}>
												{bg}
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
						name="dateOfBirth"
						render={({ field }) => (
							<FormItem className="flex flex-col">
								<FormLabel>Date of Birth</FormLabel>
								<DatePicker
									date={field.value}
									setDate={field.onChange}
									placeholder="Pick date of birth"
								/>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="dateOfDeath"
						render={({ field }) => (
							<FormItem className="flex flex-col">
								<FormLabel>Date of Death (optional)</FormLabel>
								<DatePicker
									date={field.value}
									setDate={field.onChange}
									placeholder="Pick date of death"
								/>
								<FormMessage />
							</FormItem>
						)}
					/>
				</div>

				<CustomFieldsSection defs={customFields} />

				<Button type="submit" disabled={form.formState.isSubmitting}>
					Submit
				</Button>
			</form>
		</Form>
	);
}

function RouteComponent() {
	const { data: customFieldDefs, isLoading } = useQuery(getOrganizationCustomFieldsQuery());

	return (
		<div className="flex h-full w-full flex-col items-start justify-start gap-4 p-2">
			<PageHeader
				crumbs={[{ label: "Members", to: "/members" }, { label: "Create" }]}
				title="Add a missing Member's Profile"
				description="Add a missing member's profile to the community. This profile will be added as a Draft Record and will be visible to all members of the community. Owner/Admin will approve/reject the profile based on the information's correctness."
			/>
			{!isLoading && customFieldDefs ? (
				<CommunityProfileForm customFields={customFieldDefs} />
			) : null}
		</div>
	);
}
