import { getOrganizationCustomFieldsQuery } from "@/api/fields";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { safeAsync } from "@/lib/safe";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import z from "zod";
import { COMMUNITY_PROFILE_BLOOD_GROUP, GENDERS } from "@/db/constants";
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
import { CustomFieldsForm, type CustomField } from "@/components/CustomFieldsForm";
import { addMissingMember } from "@/api/communityProfile";
import { toast } from "sonner";
import { usePostHog } from "@posthog/react";

export const Route = createFileRoute("/_authed/_community/members/create/")({
	component: RouteComponent,
	beforeLoad: async ({ context }) => {
		await safeAsync(context.queryClient.ensureQueryData(getOrganizationCustomFieldsQuery()));
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
							<Route.Link to={"/dashboard"}>Home</Route.Link>
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbLink asChild>
							<Route.Link to={"/members"}>Members</Route.Link>
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>Create</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
		</div>
	);
}

const communityProfileSchema = z.object({
	firstName: z.string().min(1, "First name is required"),
	middleName: z.string().optional(),
	lastName: z.string().min(1, "Last name is required"),
	nickName: z.string().optional(),
	gender: z.enum([GENDERS.male, GENDERS.female, GENDERS.other]).optional(),
	email: z.email().optional(),
	bloodGroup: z
		.enum([
			COMMUNITY_PROFILE_BLOOD_GROUP["A+"],
			COMMUNITY_PROFILE_BLOOD_GROUP["A-"],
			COMMUNITY_PROFILE_BLOOD_GROUP["B+"],
			COMMUNITY_PROFILE_BLOOD_GROUP["B-"],
			COMMUNITY_PROFILE_BLOOD_GROUP["AB+"],
			COMMUNITY_PROFILE_BLOOD_GROUP["AB-"],
			COMMUNITY_PROFILE_BLOOD_GROUP["O+"],
			COMMUNITY_PROFILE_BLOOD_GROUP["O-"],
		])
		.optional(),
	mobileNumber: z.string().optional(),
	dateOfBirth: z.date().optional(),
	dateOfDeath: z.date().optional(),
	customFieldData: z.record(z.string(), z.any()).optional(),
});

type CommunityProfileFormValues = z.infer<typeof communityProfileSchema>;

function CommunityProfileForm({ customFields }: { customFields: CustomField[] }) {
	const navigate = Route.useNavigate();
	const posthog = usePostHog();
	const form = useForm<CommunityProfileFormValues>({
		resolver: zodResolver(communityProfileSchema),
		defaultValues: {
			firstName: "",
			lastName: "",
		},
	});

	const onSubmit = form.handleSubmit(async (data) => {
		const result = await safeAsync(
			addMissingMember({
				data: {
					firstName: data.firstName,
					middleName: data.middleName,
					lastName: data.lastName,
					nickName: data.nickName,
					gender: data.gender,
					email: data.email,
					bloodGroup: data.bloodGroup,
					mobileNumber: data.mobileNumber,
					dateOfBirth: data.dateOfBirth ? data.dateOfBirth.toJSON() : undefined,
					dateOfDeath: data.dateOfDeath ? data.dateOfDeath.toJSON() : undefined,
					customFieldData: data.customFieldData,
				},
			})
		);

		if (!result.success) {
			console.error(result.error);
			toast.error("Member", {
				description: "Failed to add member",
			});
			return;
		}

		posthog.capture("member_added", {});
		toast.success("Member", {
			description:
				"Member added successfully as a Draft Record. Owner/Admin will be notified to approve the profile.",
		});
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
	const { data: customFieldsResponse, isLoading } = useQuery(getOrganizationCustomFieldsQuery());

	return (
		<div className="flex h-full w-full flex-col items-start justify-start gap-4 p-2">
			<PageHeader />
			<div className="flex flex-col items-start justify-start gap-1">
				<h1 className="text-2xl font-semibold">Add a missing Member's Profile</h1>
				<p className="text-sm text-muted-foreground">
					Add a missing member's profile to the community. This profile will be added as a Draft
					Record and will be visible to all members of the community. Owner/Admin will
					approve/reject the profile based on the information's correctness.
				</p>
			</div>
			{!isLoading && customFieldsResponse ? (
				<CommunityProfileForm customFields={customFieldsResponse?.data ?? []} />
			) : null}
		</div>
	);
}
