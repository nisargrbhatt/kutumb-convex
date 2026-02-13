import { getMyCommunityProfileQuery, upsertMyCommunityProfile } from "@/api/communityProfile";
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
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
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
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export const Route = createFileRoute("/_authed/community/$slug/_community/profile/info")({
	component: RouteComponent,
	loader: async ({ context, params }) => {
		await context.queryClient.ensureQueryData(getMyCommunityProfileQuery({ slug: params.slug }));
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
							<Route.Link to={"/community/$slug/profile/info"}>Profile</Route.Link>
						</BreadcrumbLink>
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
});

type CommunityProfileFormValues = z.infer<typeof communityProfileSchema>;

function CommunityProfileForm({ defaultValues }: { defaultValues?: CommunityProfileFormValues }) {
	const { slug } = Route.useParams();
	const form = useForm<CommunityProfileFormValues>({
		resolver: zodResolver(communityProfileSchema),
		defaultValues: defaultValues,
	});

	const onSubmit = form.handleSubmit(async (data) => {
		await upsertMyCommunityProfile({
			data: {
				slug: slug,
				profile: {
					firstName: data.firstName,
					lastName: data.lastName,
					middleName:
						data?.middleName && data?.middleName?.length > 0 ? data?.middleName : undefined,
					nickName: data?.nickName && data?.nickName?.length > 0 ? data?.nickName : undefined,
					gender: data?.gender && data?.gender?.length > 0 ? data?.gender : undefined,
					email: data?.email && data?.email?.length > 0 ? data?.email : undefined,
					bloodGroup:
						data?.bloodGroup && data?.bloodGroup?.length > 0 ? data?.bloodGroup : undefined,
					mobileNumber:
						data?.mobileNumber && data?.mobileNumber?.length > 0 ? data?.mobileNumber : undefined,
					dateOfBirth: data?.dateOfBirth ? data?.dateOfBirth?.toJSON() : undefined,
					dateOfDeath: data?.dateOfDeath ? data?.dateOfDeath?.toJSON() : undefined,
				},
			},
		});
		toast.success("Community Profile", {
			description: "Community Profile updated successfully",
		});
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

				<Button type="submit" disabled={form.formState.isSubmitting} onSubmit={onSubmit}>
					Submit
				</Button>
			</form>
		</Form>
	);
}

function RouteComponent() {
	const { slug } = Route.useParams();
	const { data, isLoading } = useSuspenseQuery(getMyCommunityProfileQuery({ slug }));

	return (
		<div className="flex h-full w-full flex-col items-start justify-start gap-4 p-2">
			<PageHeader />

			{!isLoading ? (
				<CommunityProfileForm
					defaultValues={
						data
							? {
									firstName: data.firstName,
									lastName: data.lastName,
									middleName: data.middleName ?? undefined,
									nickName: data.nickName ?? undefined,
									email: data.email ?? undefined,
									mobileNumber: data.mobileNumber ?? undefined,
									dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
									dateOfDeath: data.dateOfDeath ? new Date(data.dateOfDeath) : undefined,
									gender: data.gender as any,
									bloodGroup: data.bloodGroup as any,
								}
							: {
									firstName: "",
									lastName: "",
									gender: "male",
								}
					}
				/>
			) : (
				<Skeleton />
			)}
		</div>
	);
}
