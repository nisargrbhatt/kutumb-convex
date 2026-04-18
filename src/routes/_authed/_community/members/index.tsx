import { getCommunityMembersQuery } from "@/api/communityProfile";
import { useEffect, useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { COMMUNITY_PROFILE_STATUS, GENDERS } from "@/db/constants";
import type { ColumnDef } from "@tanstack/react-table";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus, Search, Users, X } from "lucide-react";
import { z } from "zod";

const membersSearchSchema = z.object({
	search: z.string().optional().catch(""),
	status: z.string().optional().catch(""),
	gender: z.string().optional().catch(""),
	page: z.number().int().min(1).optional().catch(1),
	pageSize: z.number().int().min(1).max(100).optional().catch(10),
});

type MembersSearch = z.infer<typeof membersSearchSchema>;

export const Route = createFileRoute("/_authed/_community/members/")({
	validateSearch: membersSearchSchema,
	loaderDeps: ({ search }) => search,
	loader: async ({ context, deps }) => {
		await context.queryClient.ensureQueryData(
			getCommunityMembersQuery({
				search: deps.search || undefined,
				status: deps.status || undefined,
				gender: deps.gender || undefined,
				page: deps.page ?? 1,
				pageSize: deps.pageSize ?? 10,
			})
		);
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
						<BreadcrumbPage>Members</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
		</div>
	);
}

type CommunityMember = {
	id: string;
	firstName: string;
	middleName: string | null;
	lastName: string;
	nickName: string | null;
	gender: string | null;
	email: string | null;
	status: string;
	bloodGroup: string | null;
	mobileNumber: string | null;
	dateOfBirth: string | null;
};

const columns: ColumnDef<CommunityMember>[] = [
	{
		accessorKey: "name",
		header: "Name",
		cell: ({ row }) => {
			const fullName = [row.original.firstName, row.original.middleName, row.original.lastName]
				.filter(Boolean)
				.join(" ");
			return (
				<Link to={"/members/$id"} params={{ id: row.original.id }}>
					<div className="flex flex-col">
						<span className="font-medium">{fullName}</span>
						{row.original.nickName && (
							<span className="text-xs text-muted-foreground">({row.original.nickName})</span>
						)}
					</div>
				</Link>
			);
		},
	},
	{
		accessorKey: "email",
		header: "Email",
		meta: { className: "hidden sm:table-cell" },
		cell: ({ row }) => <span>{row.original.email || "-"}</span>,
	},
	{
		accessorKey: "gender",
		header: "Gender",
		meta: { className: "hidden md:table-cell" },
		cell: ({ row }) => <span className="capitalize">{row.original.gender || "-"}</span>,
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => {
			const status = row.original.status;
			const colorMap: Record<string, string> = {
				active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
				inactive: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
				draft: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
			};
			return (
				<span
					className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${colorMap[status] || ""}`}
				>
					{status}
				</span>
			);
		},
	},
	{
		accessorKey: "bloodGroup",
		header: "Blood Group",
		meta: { className: "hidden lg:table-cell" },
		cell: ({ row }) => <span>{row.original.bloodGroup || "-"}</span>,
	},
	{
		accessorKey: "mobileNumber",
		header: "Mobile",
		meta: { className: "hidden lg:table-cell" },
		cell: ({ row }) => <span>{row.original.mobileNumber || "-"}</span>,
	},
	{
		accessorKey: "dateOfBirth",
		header: "DOB",
		meta: { className: "hidden md:table-cell" },
		cell: ({ row }) => {
			const dob = row.original.dateOfBirth;
			if (!dob) return <span>-</span>;
			try {
				const date = new Date(dob);
				if (isNaN(date.getTime())) return <span>{dob}</span>;
				const formattedDate = format(date, "PPP");
				const isoDate = date.toISOString();
				return (
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<span className="cursor-help underline decoration-dotted underline-offset-2">
									{formattedDate}
								</span>
							</TooltipTrigger>
							<TooltipContent>
								<p>{isoDate}</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				);
			} catch (e) {
				return <span>{dob}</span>;
			}
		},
	},
];

function MembersFilters() {
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const [searchValue, setSearchValue] = useState(search.search ?? "");

	useEffect(() => {
		const timeout = setTimeout(() => {
			if (searchValue !== (search.search ?? "")) {
				navigate({
					search: (prev: MembersSearch) => ({
						...prev,
						search: searchValue || undefined,
						page: 1,
					}),
				});
			}
		}, 300);
		return () => clearTimeout(timeout);
	}, [searchValue, navigate, search.search]);

	return (
		<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
			<div className="relative flex-1">
				<Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					placeholder="Search by name or email..."
					className="pl-9"
					value={searchValue}
					onChange={(e) => setSearchValue(e.target.value)}
				/>
			</div>
			<Select
				value={search.status ?? "all"}
				onValueChange={(value) => {
					navigate({
						search: (prev: MembersSearch) => ({
							...prev,
							status: value === "all" ? undefined : value,
							page: 1,
						}),
					});
				}}
			>
				<SelectTrigger className="w-full sm:w-[140px]">
					<SelectValue placeholder="Status" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All Status</SelectItem>
					{Object.values(COMMUNITY_PROFILE_STATUS).map((s) => (
						<SelectItem key={s} value={s} className="capitalize">
							{s}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Select
				value={search.gender ?? "all"}
				onValueChange={(value) => {
					navigate({
						search: (prev: MembersSearch) => ({
							...prev,
							gender: value === "all" ? undefined : value,
							page: 1,
						}),
					});
				}}
			>
				<SelectTrigger className="w-full sm:w-[140px]">
					<SelectValue placeholder="Gender" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All Genders</SelectItem>
					{Object.values(GENDERS).map((g) => (
						<SelectItem key={g} value={g} className="capitalize">
							{g}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{(search.search || search.status || search.gender) && (
				<Button
					variant="ghost"
					size="sm"
					className="w-full sm:w-auto"
					onClick={() => {
						setSearchValue("");
						navigate({
							search: {
								page: 1,
								pageSize: search.pageSize ?? 10,
							},
						});
					}}
				>
					<X className="mr-1 size-4" />
					Clear
				</Button>
			)}
		</div>
	);
}

function MembersPagination({
	total,
	page,
	pageSize,
}: {
	total: number;
	page: number;
	pageSize: number;
}) {
	const navigate = Route.useNavigate();
	const totalPages = Math.ceil(total / pageSize);

	return (
		<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<p className="text-center text-sm text-muted-foreground sm:text-left">
				Showing {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)} of{" "}
				{total} members
			</p>
			<div className="flex items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					disabled={page <= 1}
					onClick={() => {
						navigate({
							search: (prev: MembersSearch) => ({
								...prev,
								page: (prev.page ?? 1) - 1,
							}),
						});
					}}
				>
					<ChevronLeft className="mr-1 size-4" />
					Prev
				</Button>
				<span className="text-sm text-muted-foreground">
					Page {page} of {totalPages || 1}
				</span>
				<Button
					variant="outline"
					size="sm"
					disabled={page >= totalPages}
					onClick={() => {
						navigate({
							search: (prev: MembersSearch) => ({
								...prev,
								page: (prev.page ?? 1) + 1,
							}),
						});
					}}
				>
					Next
					<ChevronRight className="ml-1 size-4" />
				</Button>
			</div>
		</div>
	);
}

function RouteComponent() {
	const search = Route.useSearch();

	const { data: result } = useSuspenseQuery(
		getCommunityMembersQuery({
			search: search.search || undefined,
			status: search.status || undefined,
			gender: search.gender || undefined,
			page: search.page ?? 1,
			pageSize: search.pageSize ?? 10,
		})
	);

	return (
		<div className="flex h-full w-full flex-col items-start justify-start gap-4 p-2">
			<PageHeader />

			<div className="flex w-full flex-col gap-6 pt-4">
				<div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
					<div>
						<h2 className="text-lg font-medium">Community Members</h2>
						<p className="text-sm text-muted-foreground">
							Browse and search all community members.
						</p>
						<Route.Link to={"/members/create"}>
							<Button type="button" variant={"outline"} size="sm">
								<Plus />
								Add missing member
							</Button>
						</Route.Link>
					</div>
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Users className="size-4" />
						<span>{result.total} members</span>
					</div>
				</div>

				<MembersFilters />

				<DataTable columns={columns} data={result.data} />

				{result.total > 0 && (
					<MembersPagination total={result.total} page={result.page} pageSize={result.pageSize} />
				)}
			</div>
		</div>
	);
}
