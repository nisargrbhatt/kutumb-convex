import type { MemberFilter } from "@/domain/communityProfile";

/**
 * Query key factories. Every org-scoped key starts with `[domain, orgId]`, so switching org never
 * reads another tenant's cache and `invalidateQueries({ queryKey: xKeys.all(orgId) })` hits the
 * whole domain. Pure: no server imports (tested in node).
 */

export const profileKeys = {
	all: (orgId: string) => ["profile", orgId] as const,
	mine: (orgId: string) => [...profileKeys.all(orgId), "mine"] as const,
	list: (orgId: string, filter: MemberFilter) =>
		[...profileKeys.all(orgId), "list", filter] as const,
	detail: (orgId: string, id: string) => [...profileKeys.all(orgId), "detail", id] as const,
	activeCount: (orgId: string) => [...profileKeys.all(orgId), "activeCount"] as const,
	forRelation: (orgId: string, subjectId: string) =>
		[...profileKeys.all(orgId), "forRelation", subjectId] as const,
	graph: (orgId: string, focusId: string, depth: number) =>
		[...profileKeys.all(orgId), "graph", focusId, depth] as const,
	search: (orgId: string, query: string) => [...profileKeys.all(orgId), "search", query] as const,
};

export const relationKeys = {
	all: (orgId: string) => ["relation", orgId] as const,
	mine: (orgId: string) => [...relationKeys.all(orgId), "mine"] as const,
	incomingCount: (orgId: string) => [...relationKeys.all(orgId), "incomingCount"] as const,
	outgoingCount: (orgId: string) => [...relationKeys.all(orgId), "outgoingCount"] as const,
};

export const addressKeys = {
	all: (orgId: string) => ["address", orgId] as const,
	mine: (orgId: string) => [...addressKeys.all(orgId), "mine"] as const,
};

export const fieldKeys = {
	all: (orgId: string) => ["field", orgId] as const,
	list: (orgId: string) => [...fieldKeys.all(orgId), "list"] as const,
};

export const orgKeys = {
	all: (orgId: string) => ["organization", orgId] as const,
	usage: (orgId: string) => [...orgKeys.all(orgId), "usage"] as const,
	invitations: (orgId: string) => [...orgKeys.all(orgId), "invitations"] as const,
};

/** User-scoped (not tenant-scoped): survives org switch. */
export const accountKeys = {
	all: (userId: string) => ["account", userId] as const,
	organizationCount: (userId: string) => [...accountKeys.all(userId), "organizationCount"] as const,
	connections: (userId: string) => [...accountKeys.all(userId), "connections"] as const,
};
