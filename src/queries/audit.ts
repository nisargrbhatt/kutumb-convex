import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { AuditFilter } from "@/domain/audit";
import { getAuditFacets, getAuditGroups } from "@/server/audit";
import { auditKeys } from "./keys";

/** Filter without the cursor: the cursor is the infinite query's page param. */
export type AuditQueryFilter = Omit<AuditFilter, "cursor">;

const groupsQuery = (queryKey: readonly unknown[], filter: Omit<AuditFilter, "cursor">) =>
	infiniteQueryOptions({
		queryKey,
		queryFn: ({ pageParam }) =>
			getAuditGroups({ data: { ...filter, cursor: pageParam ?? undefined } }),
		initialPageParam: null as string | null,
		getNextPageParam: (last) => last.nextCursor,
	});

/** Org-wide Audit log (owner/admin), load-more by group cursor. */
export const auditLogQuery = (orgId: string, filter: AuditQueryFilter) =>
	groupsQuery(auditKeys.log(orgId, filter), filter);

/** One profile's History (subject or counterpart). */
export const profileHistoryQuery = (
	orgId: string,
	profileId: string,
	filter: Omit<AuditQueryFilter, "profileId">
) => groupsQuery(auditKeys.profile(orgId, profileId, filter), { ...filter, profileId });

export const auditFacetsQuery = (orgId: string) =>
	queryOptions({
		queryKey: [...auditKeys.all(orgId), "facets"] as const,
		queryFn: () => getAuditFacets(),
		staleTime: 60 * 1000,
	});

export type AuditGroupsPage = Awaited<ReturnType<typeof getAuditGroups>>;
export type AuditGroup = AuditGroupsPage["groups"][number];
