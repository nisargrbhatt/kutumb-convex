import { ProfileName } from "@/components/profile/ProfileName";
import { ProfileStatusBadge } from "@/components/profile/ProfileStatusBadge";
import { PageHeader } from "@/components/CommunityLayout/PageHeader";
import { getCommunityMembersQuery } from "@/queries/communityProfile";
import { useEffect, useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
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
import { COMMUNITY_PROFILE_STATUS, GENDERS } from "@/db/constants";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus, Search, Users, X } from "lucide-react";
import { toast } from "sonner";
import { usePostHog } from "@posthog/react";
import { z } from "zod";
import { ProfileForm } from "@/components/profile/ProfileForm";
import {
	MEMBER_FILTER_DEFAULTS,
	memberFilterSchema,
	toFormValues,
	type CommunityProfileInput,
	type MemberFilter,
} from "@/domain/communityProfile";
import { isAppError } from "@/domain/errors";
import { limitMessage } from "@/domain/limits";
import { useCan } from "@/hooks/useCan";
import { safeAsync } from "@/lib/safe";
import { getOrganizationCustomFieldsQuery } from "@/queries/fields";
import { getOrgUsageQuery } from "@/queries/organization";
import { addMissingMember } from "@/server/communityProfile";

/** `create=1` (e.g. from a CTA elsewhere) opens the Add member drawer, then is stripped. */
const membersSearchSchema = memberFilterSchema.extend({
	create: z.coerce.boolean().optional().catch(undefined),
});
type MembersSearch = z.infer<typeof membersSearchSchema>;

export const Route = createFileRoute("/_authed/_community/members/")({
	validateSearch: membersSearchSchema,
	search: { middlewares: [stripSearchParams(MEMBER_FILTER_DEFAULTS)] },
	loaderDeps: ({ search: { create: _create, ...filter } }) => filter,
	loader: async ({ context, deps }) => {
		await context.queryClient.ensureQueryData(getCommunityMembersQuery(deps));
	},
	component: RouteComponent,
});

// TODO(issue 09): replace with useAddMissingMember().
function useAddMissingMember() {
	const queryClient = useQueryClient();
	const posthog = usePostHog();
	const [isPending, setIsPending] = useState(false);

	const add = async (input: CommunityProfileInput) => {
		setIsPending(true);
		const result = await safeAsync(addMissingMember({ data: input }));
		setIsPending(false);

		if (!result.success) {
			console.error(result.error);
			const limit = isAppError(result.error) ? limitMessage(result.error) : undefined;
			toast.error(limit?.title ?? "Add member", {
				description: limit?.description ?? result.error?.message ?? "Failed to add member",
			});
			return false;
		}

		posthog.capture("member_added", {});
		toast.success("Member added", {
			description: "Added as a Draft Record. An owner/admin will approve the profile.",
		});
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: ["get-community-members"] }),
			queryClient.invalidateQueries({ queryKey: getOrgUsageQuery().queryKey }),
		]);
		return true;
	};

	return { add, isPending };
}

function AddMemberDrawer({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { data: customFieldDefs } = useQuery({
		...getOrganizationCustomFieldsQuery(),
		enabled: open,
	});
	const { add, isPending } = useAddMissingMember();

	return (
		<ProfileForm
			mode="admin"
			isNew
			open={open}
			onOpenChange={onOpenChange}
			defaultValues={toFormValues(null)}
			customFieldDefs={customFieldDefs ?? []}
			onSubmit={add}
			isPending={isPending}
		/>
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
		cell: ({ row }) => (
			<Link to={"/members/$id"} params={{ id: row.original.id }}>
				<div className="flex flex-col">
					<ProfileName profile={row.original} className="font-medium" />
					{row.original.nickName && (
						<span className="text-xs text-muted-foreground">({row.original.nickName})</span>
					)}
				</div>
			</Link>
		),
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
		cell: ({ row }) => <ProfileStatusBadge status={row.original.status} />,
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
							<TooltipTrigger
								render={
									<span className="cursor-help underline decoration-dotted underline-offset-2" />
								}
							>
								{formattedDate}
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
	const [searchValue, setSearchValue] = useState(search.search);

	useEffect(() => {
		const timeout = setTimeout(() => {
			if (searchValue !== search.search) {
				navigate({
					search: (prev: MembersSearch) => ({
						...prev,
						search: searchValue,
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
				value={search.status || "all"}
				onValueChange={(value) => {
					navigate({
						search: (prev: MembersSearch) => ({
							...prev,
							status: (value && value !== "all" ? value : "") as MemberFilter["status"],
							page: 1,
						}),
					});
				}}
			>
				<SelectTrigger className="w-full sm:w-35">
					<SelectValue>{(v: string | null) => (v && v !== "all" ? v : "All Status")}</SelectValue>
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
				value={search.gender || "all"}
				onValueChange={(value) => {
					navigate({
						search: (prev: MembersSearch) => ({
							...prev,
							gender: (value && value !== "all" ? value : "") as MemberFilter["gender"],
							page: 1,
						}),
					});
				}}
			>
				<SelectTrigger className="w-full sm:w-35">
					<SelectValue>{(v: string | null) => (v && v !== "all" ? v : "All Genders")}</SelectValue>
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
								pageSize: search.pageSize,
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
								page: prev.page - 1,
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
								page: prev.page + 1,
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
	const { create, ...search } = Route.useSearch();
	const navigate = Route.useNavigate();
	const canCreate = useCan({ communityProfile: ["create"] });
	const [addOpen, setAddOpen] = useState(false);

	const { data: result } = useSuspenseQuery(getCommunityMembersQuery(search));

	useEffect(() => {
		if (!create) return;
		if (canCreate) setAddOpen(true);
		navigate({ search: ({ create: _create, ...prev }: MembersSearch) => prev, replace: true });
	}, [create, canCreate, navigate]);

	return (
		<div className="flex h-full w-full flex-col items-start justify-start gap-4 p-2">
			<PageHeader
				crumbs={[{ label: "Members" }]}
				title="Community Members"
				description="Browse and search all community members."
				actions={
					<>
						<span className="flex items-center gap-2 text-sm text-muted-foreground">
							<Users className="size-4" />
							{result.total} members
						</span>
						{canCreate && (
							<Button type="button" size="sm" onClick={() => setAddOpen(true)}>
								<Plus />
								Add member
							</Button>
						)}
					</>
				}
			/>

			<div className="flex w-full flex-col gap-6">
				<MembersFilters />

				<DataTable columns={columns} data={result.data} />

				{result.total > 0 && (
					<MembersPagination total={result.total} page={result.page} pageSize={result.pageSize} />
				)}
			</div>

			{canCreate && <AddMemberDrawer open={addOpen} onOpenChange={setAddOpen} />}
		</div>
	);
}
