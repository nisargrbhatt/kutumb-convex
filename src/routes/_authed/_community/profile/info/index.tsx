import { upsertMyCommunityProfile } from "@/server/communityProfile";
import { getMyCommunityProfileQuery } from "@/queries/communityProfile";
import { getOrganizationCustomFieldsQuery } from "@/queries/fields";
import { CustomFieldsForm, type CustomField } from "@/components/CustomFieldsForm";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useSuspenseQuery } from "@tanstack/react-query";
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
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { safeAsync } from "@/lib/safe";
import { getOrgUsageQuery } from "@/queries/organization";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authed/_community/profile/info/")({
	component: RouteComponent,
	loader: async ({ context }) => {
		await Promise.allSettled([
			context.queryClient.ensureQueryData(getMyCommunityProfileQuery()),
			context.queryClient.ensureQueryData(getOrganizationCustomFieldsQuery()),
		]);
	},
	pendingComponent: () => <p>Loading...</p>,
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
						<BreadcrumbLink render={<Route.Link to={"/profile/info"} />}>Profile</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>Info</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
		</div>
	);
}

function CommunityProfileForm({
	defaultValues,
	customFields,
}: {
	defaultValues: CommunityProfileFormValues;
	customFields: CustomField[];
}) {
	const form = useForm<CommunityProfileFormValues>({
		resolver: zodResolver(communityProfileFormSchema),
		defaultValues: defaultValues,
	});
	const queryClient = useQueryClient();

	const onSubmit = form.handleSubmit(async (data) => {
		const result = await safeAsync(upsertMyCommunityProfile({ data: toInput(data) }));

		if (!result.success) {
			console.error(result.error);
			toast.error("Profile", {
				description: result.error?.message ?? "Failed to update profile",
			});
			return;
		}

		toast.success("Community Profile", {
			description: "Community Profile updated successfully",
		});
		queryClient.invalidateQueries({ queryKey: getOrgUsageQuery().queryKey });
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
											<SelectItem key={gender} value={gender}>
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
				</div>

				{customFields && customFields.length > 0 && (
					<>
						<div className="my-2 border-t" />
						<CustomFieldsForm customFields={customFields} />
					</>
				)}

				<Button type="submit" disabled={form.formState.isSubmitting}>
					Submit
				</Button>
			</form>
		</Form>
	);
}

function RouteComponent() {
	const { data: session } = authClient.useSession();
	const { data } = useSuspenseQuery(getMyCommunityProfileQuery());
	const { data: customFieldsResponse } = useSuspenseQuery(getOrganizationCustomFieldsQuery());

	return (
		<div className="flex h-full w-full flex-col items-start justify-start gap-4 p-2">
			<PageHeader />

			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-lg font-medium">Profile</h2>
					<p className="text-sm text-muted-foreground">
						Add your community profile information. This will be visible to other members of the
						community.
					</p>
				</div>
			</div>

			<CommunityProfileForm
				customFields={customFieldsResponse?.data ?? []}
				defaultValues={toFormValues(data, { gender: "male", email: session?.user?.email ?? "" })}
			/>
		</div>
	);
}
