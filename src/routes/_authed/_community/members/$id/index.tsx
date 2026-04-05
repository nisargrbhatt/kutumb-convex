import { getCommunityMemberById } from "@/api/communityProfile";
import { safeAsync } from "@/lib/safe";
import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { format } from "date-fns";
import {
	CheckCircle,
	XCircle,
	MapPin,
	Mail,
	Phone,
	Calendar,
	Droplet,
	User,
	Info,
	Building,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_authed/_community/members/$id/")({
	component: RouteComponent,
	loader: async ({ params }) => {
		const result = await safeAsync(
			getCommunityMemberById({
				data: {
					id: params.id,
				},
			})
		);

		if (!result.success) {
			throw notFound();
		}

		return result.data;
	},
});

function PageHeader({ name }: { name: string }) {
	return (
		<div className="flex flex-row items-center justify-start gap-2">
			<SidebarTrigger />
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink asChild>
							<Link to={"/dashboard"}>Home</Link>
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbLink asChild>
							<Link to={"/members"}>Members</Link>
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>{name}</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
		</div>
	);
}

const StatusBadge = ({ status }: { status: string }) => {
	const statusColorMap: Record<string, string> = {
		active:
			"bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 border-green-200 dark:border-green-800",
		inactive:
			"bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300 border-red-200 dark:border-red-800",
		draft:
			"bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300 border-orange-200 dark:border-orange-800",
	};

	const strStatus = status?.toLowerCase() || "draft";
	return (
		<Badge
			variant="outline"
			className={`px-3 py-0.5 font-medium capitalize ${statusColorMap[strStatus] || statusColorMap.draft}`}
		>
			{status}
		</Badge>
	);
};

function RouteComponent() {
	const { profile, addresses, customFields } = Route.useLoaderData();
	const { data: activeMemberRole } = authClient.useActiveMemberRole();

	const fullName = [profile.firstName, profile.middleName, profile.lastName]
		.filter(Boolean)
		.join(" ");
	const initials = (profile.firstName?.[0] || "") + (profile.lastName?.[0] || "");

	const showActionBlock = activeMemberRole?.role === "admin" || activeMemberRole?.role === "owner";

	const acceptProfile = async () => {};

	return (
		<div className="flex h-full w-full flex-col items-start justify-start gap-4 overflow-y-auto p-2">
			<PageHeader name={fullName} />

			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pt-4 pb-12">
				{/* Top Profile Card */}
				<div className="relative overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm transition-all hover:shadow-md">
					{/* Decorative background element */}
					<div className="pointer-events-none absolute top-0 right-0 -mt-16 -mr-16 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />

					<div className="relative flex flex-col justify-between gap-6 p-6 sm:flex-row sm:items-center">
						<div className="flex items-center gap-6">
							<div className="rounded-full bg-gradient-to-br from-primary/20 to-primary/10 p-2 shadow-sm ring-1 ring-primary/10">
								<Avatar className="size-20 border-2 border-background shadow-sm sm:size-24">
									<AvatarFallback className="text-2xl font-light text-primary">
										{initials.toUpperCase()}
									</AvatarFallback>
								</Avatar>
							</div>

							<div className="flex flex-col gap-1.5">
								<div className="flex items-center gap-3">
									<h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{fullName}</h1>
									<StatusBadge status={profile.status} />
								</div>
								{profile.nickName && (
									<p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
										<User className="size-4" />"{profile.nickName}"
									</p>
								)}
								{(profile.email || profile.mobileNumber) && (
									<div className="mt-1 flex flex-wrap gap-4 text-sm text-muted-foreground">
										{profile.email && (
											<span className="flex items-center gap-1.5">
												<Mail className="size-3.5" />
												{profile.email}
											</span>
										)}
										{profile.mobileNumber && (
											<span className="flex items-center gap-1.5">
												<Phone className="size-3.5" />
												{profile.mobileNumber}
											</span>
										)}
									</div>
								)}
							</div>
						</div>
						{showActionBlock ? (
							<div className="flex items-center gap-3 self-start rounded-xl border border-border/50 bg-muted/50 p-1.5 sm:self-center">
								<Button
									variant="ghost"
									className="rounded-lg hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 dark:hover:text-red-400"
								>
									<XCircle className="mr-2 size-4" /> Reject
								</Button>
								<Button className="rounded-lg shadow-sm">
									<CheckCircle className="mr-2 size-4" /> Accept
								</Button>
							</div>
						) : null}
					</div>
				</div>

				{/* Tabs Section */}
				<Tabs defaultValue="details" className="w-full">
					<TabsList className="grid w-full max-w-sm grid-cols-2 rounded-xl border border-border/50 bg-muted/50 p-1">
						<TabsTrigger
							value="details"
							className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm"
						>
							<Info className="mr-2 size-4" />
							Details
						</TabsTrigger>
						<TabsTrigger
							value="addresses"
							className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm"
						>
							<MapPin className="mr-2 size-4" />
							Addresses
						</TabsTrigger>
					</TabsList>

					<TabsContent
						value="details"
						className="mt-6 animate-in space-y-6 duration-300 fade-in slide-in-from-bottom-2"
					>
						{/* Basic Information */}
						<Card className="group overflow-hidden rounded-2xl border-border/50 shadow-sm">
							<CardHeader className="border-b border-border/50 bg-muted/30 pb-4">
								<CardTitle className="flex items-center gap-2 text-lg font-medium">
									<User className="size-5 text-primary/70" /> Basic Information
								</CardTitle>
							</CardHeader>
							<CardContent className="p-6">
								<div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
									<InfoItem
										icon={<Calendar />}
										label="Date of Birth"
										value={profile.dateOfBirth ? format(new Date(profile.dateOfBirth), "PPP") : "-"}
									/>
									{profile.dateOfDeath && (
										<InfoItem
											icon={<Calendar />}
											label="Date of Death"
											value={format(new Date(profile.dateOfDeath), "PPP")}
										/>
									)}
									<InfoItem
										icon={<Droplet />}
										label="Blood Group"
										value={profile.bloodGroup || "-"}
									/>
									<InfoItem
										icon={<User />}
										label="Gender"
										value={
											profile.gender ? <span className="capitalize">{profile.gender}</span> : "-"
										}
									/>
								</div>

								{profile.comment && (
									<div className="mt-8 border-t border-border/50 pt-6">
										<h4 className="mb-2 text-sm font-medium text-muted-foreground">
											Comment / Notes
										</h4>
										<p className="rounded-xl border border-border/50 bg-muted/30 p-4 text-sm leading-relaxed text-foreground/80">
											{profile.comment}
										</p>
									</div>
								)}
							</CardContent>
						</Card>

						{/* Custom Fields */}
						{customFields && customFields.length > 0 && (
							<Card className="overflow-hidden rounded-2xl border-border/50 shadow-sm">
								<CardHeader className="border-b border-border/50 bg-muted/30 pb-4">
									<CardTitle className="flex items-center gap-2 text-lg font-medium">
										<Building className="size-5 text-primary/70" /> Additional Details
									</CardTitle>
									<CardDescription>Custom profile information</CardDescription>
								</CardHeader>
								<CardContent className="p-6">
									<div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
										{customFields.map((field) => {
											const data = profile.customFieldData as Record<string, any>;
											const val = data?.[field];
											return (
												<InfoItem
													key={field}
													label={field}
													value={
														val !== undefined && val !== null && val !== "" ? String(val) : "-"
													}
												/>
											);
										})}
									</div>
								</CardContent>
							</Card>
						)}
					</TabsContent>

					<TabsContent
						value="addresses"
						className="mt-6 animate-in duration-300 fade-in slide-in-from-bottom-2"
					>
						{addresses && addresses.length > 0 ? (
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								{addresses.map((address) => (
									<Card
										key={address.id}
										className="rounded-2xl border-border/50 bg-card transition-shadow hover:shadow-md"
									>
										<CardHeader className="border-b border-border/50 bg-muted/20 pb-3">
											<div className="flex items-center justify-between">
												<CardTitle className="flex items-center gap-2 text-base font-medium">
													<MapPin className="size-4 text-primary/70" />
													Address
												</CardTitle>
												<Badge variant="secondary" className="capitalize">
													{address.type}
												</Badge>
											</div>
										</CardHeader>
										<CardContent className="pt-4">
											<div className="flex flex-col gap-1 text-sm text-foreground/80">
												<span className="mb-1 font-medium text-foreground">{address.line1}</span>
												{address.line2 && <span>{address.line2}</span>}
												<span>
													{address.city}, {address.state} {address.postalCode}
												</span>
												<span>{address.country}</span>

												{address.digipin && (
													<div className="mt-3">
														<Badge
															variant="outline"
															className="bg-muted/40 font-mono tracking-wider"
														>
															DIGIPIN: {address.digipin}
														</Badge>
													</div>
												)}

												{address.note && (
													<p className="mt-4 rounded-lg border border-border/40 bg-muted/40 p-3 text-xs text-muted-foreground italic">
														{address.note}
													</p>
												)}
											</div>
										</CardContent>
									</Card>
								))}
							</div>
						) : (
							<Card className="rounded-2xl border-2 border-dashed bg-muted/10">
								<CardContent className="flex flex-col items-center justify-center py-16 text-center">
									<div className="mb-4 rounded-full bg-muted/50 p-4 ring-1 ring-border/50">
										<MapPin className="size-8 text-muted-foreground/50" />
									</div>
									<h3 className="text-lg font-medium text-foreground">No Addresses Found</h3>
									<p className="mt-1 max-w-sm text-sm text-muted-foreground">
										This profile does not have any related addresses on record at the moment.
									</p>
								</CardContent>
							</Card>
						)}
					</TabsContent>
				</Tabs>
			</div>
		</div>
	);
}

function InfoItem({
	label,
	value,
	icon,
}: {
	label: string;
	value: React.ReactNode;
	icon?: React.ReactNode;
}) {
	return (
		<div className="group/item flex flex-col gap-1.5">
			<span className="flex items-center gap-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
				{icon && (
					<span className="opacity-50 transition-opacity group-hover/item:opacity-100 [&>svg]:size-3.5">
						{icon}
					</span>
				)}
				{label}
			</span>
			<span className="text-sm font-medium text-foreground">{value}</span>
		</div>
	);
}
