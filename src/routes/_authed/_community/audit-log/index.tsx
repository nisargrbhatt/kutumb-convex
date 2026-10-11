import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, stripSearchParams } from "@tanstack/react-router";
import { endOfDay, format, isValid, parse, startOfDay } from "date-fns";
import { X } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/CommunityLayout/PageHeader";
import { ActionFilter, actionsFor } from "@/components/audit/AuditFilters";
import { AuditHistory } from "@/components/audit/AuditHistory";
import { Button } from "@/components/ui/button";
import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxList,
} from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { can } from "@/domain/permission";
import type { AuditQueryFilter } from "@/queries/audit";
import { auditFacetsQuery, auditLogQuery } from "@/queries/audit";

const DAY_FORMAT = "yyyy-MM-dd";
const day = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/)
	.optional()
	.catch(undefined);

const searchSchema = z.object({
	action: z.string().default("").catch(""),
	actor: z.string().default("").catch(""),
	profile: z.string().default("").catch(""),
	from: day,
	to: day,
});
type AuditLogSearch = z.infer<typeof searchSchema>;
const SEARCH_DEFAULTS = { action: "", actor: "", profile: "" };

const parseDay = (s?: string) => {
	if (!s) return undefined;
	const d = parse(s, DAY_FORMAT, new Date());
	return isValid(d) ? d : undefined;
};

/** URL search → query filter. Days are local-time, inclusive. */
function toFilter(s: AuditLogSearch): AuditQueryFilter {
	const from = parseDay(s.from);
	const to = parseDay(s.to);
	return {
		actions: actionsFor(s.action),
		actorUserId: s.actor || undefined,
		profileId: s.profile || undefined,
		from: from ? startOfDay(from).getTime() : undefined,
		to: to ? endOfDay(to).getTime() : undefined,
	};
}

export const Route = createFileRoute("/_authed/_community/audit-log/")({
	validateSearch: searchSchema,
	search: { middlewares: [stripSearchParams(SEARCH_DEFAULTS)] },
	beforeLoad: ({ context }) => {
		const role = context.member?.role;
		if (
			!role ||
			!can(
				{ userId: context.userId, organizationId: context.organizationId, role },
				{ auditEvent: ["read"] }
			)
		) {
			throw redirect({ to: "/dashboard" });
		}
	},
	loaderDeps: ({ search }) => search,
	loader: async ({ context, deps }) => {
		await context.queryClient.ensureInfiniteQueryData(
			auditLogQuery(context.organizationId, toFilter(deps))
		);
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { organizationId: orgId } = Route.useRouteContext();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const set = (patch: Partial<AuditLogSearch>) =>
		navigate({ search: (prev: AuditLogSearch) => ({ ...prev, ...patch }), replace: true });

	const query = useInfiniteQuery(auditLogQuery(orgId, toFilter(search)));
	const { data: facets } = useQuery(auditFacetsQuery(orgId));
	const actors = facets?.actors ?? [];
	const profiles = facets?.profiles ?? [];
	const selectedProfile = profiles.find((p) => p.id === search.profile) ?? null;
	const hasFilter = !!(search.action || search.actor || search.profile || search.from || search.to);

	return (
		<div className="flex h-full w-full flex-col items-start justify-start gap-4 overflow-y-auto p-2">
			<PageHeader
				crumbs={[{ label: "Audit log" }]}
				title="Audit log"
				description="Every change to Community Profiles in this community, grouped by request."
			/>

			<div
				role="search"
				aria-label="Audit log filters"
				className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center"
			>
				<ActionFilter
					withActions
					value={search.action}
					onChange={(action) => set({ action })}
					className="w-full lg:w-48"
				/>
				<Select
					value={search.actor || "all"}
					onValueChange={(v) => set({ actor: v && v !== "all" ? v : "" })}
				>
					<SelectTrigger className="w-full lg:w-48" aria-label="Filter by actor">
						<SelectValue>
							{(v: string | null) =>
								v && v !== "all" ? (actors.find((a) => a.id === v)?.name ?? "Actor") : "All actors"
							}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All actors</SelectItem>
						{actors.map((a) => (
							<SelectItem key={a.id} value={a.id}>
								{a.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<div className="w-full lg:w-56">
					<Combobox
						items={profiles}
						itemToStringLabel={(p: (typeof profiles)[number]) => p?.name ?? ""}
						value={selectedProfile}
						onValueChange={(next) => set({ profile: next?.id ?? "" })}
					>
						<ComboboxInput placeholder="Any profile" aria-label="Filter by profile" showClear />
						<ComboboxContent>
							<ComboboxEmpty>No profiles found.</ComboboxEmpty>
							<ComboboxList>
								{(item: (typeof profiles)[number]) => (
									<ComboboxItem key={item.id} value={item}>
										{item.name}
									</ComboboxItem>
								)}
							</ComboboxList>
						</ComboboxContent>
					</Combobox>
				</div>
				<DatePicker
					className="w-full lg:w-44"
					placeholder="From date"
					date={parseDay(search.from)}
					setDate={(d) => set({ from: d ? format(d, DAY_FORMAT) : undefined })}
				/>
				<DatePicker
					className="w-full lg:w-44"
					placeholder="To date"
					date={parseDay(search.to)}
					setDate={(d) => set({ to: d ? format(d, DAY_FORMAT) : undefined })}
				/>
				{hasFilter ? (
					<Button
						variant="ghost"
						className="w-full sm:col-span-2 lg:w-auto"
						onClick={() =>
							set({ action: "", actor: "", profile: "", from: undefined, to: undefined })
						}
					>
						<X />
						Clear filters
					</Button>
				) : null}
			</div>

			<AuditHistory
				groups={query.data?.pages.flatMap((p) => p.groups) ?? []}
				isLoading={query.isPending}
				hasNextPage={query.hasNextPage}
				isFetchingNextPage={query.isFetchingNextPage}
				onLoadMore={() => void query.fetchNextPage()}
				emptyText={hasFilter ? "No changes match these filters." : "No changes recorded yet."}
			/>
		</div>
	);
}
