import { env } from "cloudflare:workers";
import { db } from "@/db";
import { COMMUNITY_PROFILE_STATUS } from "@/db/constants";
import { safeSync } from "@/lib/safe";

// One lightweight blob per org caches the whole active graph. Subgraphs, search and
// expand are all computed in-worker via BFS over this blob, so the hot path is a single
// KV read instead of D1 fan-out. Invalidated (deleted) on any graph-shape mutation.

const KV_PREFIX = "tree:graph:";
const TTL_SECONDS = 3600; // 1h safety backstop; primary invalidation is delete-on-write

export type GraphProfile = {
	id: string;
	firstName: string;
	middleName: string | null;
	lastName: string;
	nickName: string | null;
	gender: string | null;
	bloodGroup: string | null;
	dateOfBirth: string | null;
	dateOfDeath: string | null;
	email: string | null;
	mobileNumber: string | null;
};

export type GraphEdge = {
	id: string;
	from: string;
	to: string;
	type: string | null;
};

export type OrgGraphBlob = {
	profiles: GraphProfile[];
	edges: GraphEdge[];
};

export type SubgraphNode = GraphProfile & { hop: number; isBoundary: boolean };

export type Subgraph = {
	anchorId: string | null;
	nodes: SubgraphNode[];
	edges: GraphEdge[];
};

function kvKey(organizationId: string) {
	return `${KV_PREFIX}${organizationId}`;
}

async function buildOrgGraphBlob(organizationId: string): Promise<OrgGraphBlob> {
	const [profiles, relations] = await Promise.all([
		db.query.communityProfile.findMany({
			where: (fields, ops) =>
				ops.and(
					ops.eq(fields.organizationId, organizationId),
					ops.eq(fields.status, COMMUNITY_PROFILE_STATUS.active)
				),
			columns: {
				id: true,
				firstName: true,
				middleName: true,
				lastName: true,
				nickName: true,
				gender: true,
				bloodGroup: true,
				dateOfBirth: true,
				dateOfDeath: true,
				email: true,
				mobileNumber: true,
			},
		}),
		db.query.communityRelation.findMany({
			where: (fields, ops) => ops.eq(fields.organizationId, organizationId),
			columns: { id: true, fromId: true, toId: true, type: true },
		}),
	]);

	const activeIds = new Set(profiles.map((p) => p.id));

	// Drop dangling edges and edges touching non-active profiles.
	const edges: GraphEdge[] = relations
		.filter((r) => r.fromId && r.toId && activeIds.has(r.fromId) && activeIds.has(r.toId))
		.map((r) => ({ id: r.id, from: r.fromId as string, to: r.toId as string, type: r.type }));

	return { profiles, edges };
}

export async function getOrgGraphBlob(organizationId: string): Promise<OrgGraphBlob> {
	const cached = await env.KV.get<OrgGraphBlob>(kvKey(organizationId), "json");
	const parsed = cached
		? safeSync(() => {
				if (Array.isArray(cached.profiles) && Array.isArray(cached.edges)) return cached;
				throw new Error("malformed graph blob");
			})
		: null;

	if (parsed?.success) {
		return parsed.data;
	}

	const blob = await buildOrgGraphBlob(organizationId);
	await env.KV.put(kvKey(organizationId), JSON.stringify(blob), {
		expirationTtl: TTL_SECONDS,
	});
	return blob;
}

export async function invalidateOrgGraph(organizationId: string): Promise<void> {
	await env.KV.delete(kvKey(organizationId));
}

// Undirected adjacency: family relations are conceptually bidirectional regardless of
// which side the row was stored on.
function buildAdjacency(blob: OrgGraphBlob): Map<string, Set<string>> {
	const adjacency = new Map<string, Set<string>>();
	for (const p of blob.profiles) {
		adjacency.set(p.id, new Set());
	}
	for (const e of blob.edges) {
		adjacency.get(e.from)?.add(e.to);
		adjacency.get(e.to)?.add(e.from);
	}
	return adjacency;
}

// Anchor resolution: prefer the requested id (if present & connected), else the most
// connected node in the org (densest, most useful entry point).
export function resolveAnchorId(blob: OrgGraphBlob, preferredId?: string): string | null {
	if (blob.profiles.length === 0) return null;

	const adjacency = buildAdjacency(blob);

	if (preferredId && adjacency.has(preferredId)) {
		return preferredId;
	}

	let bestId: string | null = null;
	let bestDegree = -1;
	for (const [id, neighbors] of adjacency) {
		if (neighbors.size > bestDegree) {
			bestDegree = neighbors.size;
			bestId = id;
		}
	}
	return bestId;
}

export function extractSubgraph(
	blob: OrgGraphBlob,
	focusId: string | null,
	depth: number
): Subgraph {
	if (!focusId || blob.profiles.length === 0) {
		return { anchorId: null, nodes: [], edges: [] };
	}

	const profileById = new Map(blob.profiles.map((p) => [p.id, p]));
	if (!profileById.has(focusId)) {
		return { anchorId: null, nodes: [], edges: [] };
	}

	const adjacency = buildAdjacency(blob);

	// BFS recording hop distance up to `depth`.
	const hopById = new Map<string, number>([[focusId, 0]]);
	let frontier = [focusId];
	for (let hop = 1; hop <= depth; hop++) {
		const next: string[] = [];
		for (const id of frontier) {
			for (const neighbor of adjacency.get(id) ?? []) {
				if (!hopById.has(neighbor)) {
					hopById.set(neighbor, hop);
					next.push(neighbor);
				}
			}
		}
		frontier = next;
	}

	const included = new Set(hopById.keys());

	const nodes: SubgraphNode[] = [];
	for (const [id, hop] of hopById) {
		const profile = profileById.get(id);
		if (!profile) continue;
		// Boundary = a node that still has neighbors not in the current view (expandable).
		const isBoundary = [...(adjacency.get(id) ?? [])].some((n) => !included.has(n));
		nodes.push({ ...profile, hop, isBoundary });
	}

	const edges = blob.edges.filter((e) => included.has(e.from) && included.has(e.to));

	return { anchorId: focusId, nodes, edges };
}

export function searchProfiles(
	blob: OrgGraphBlob,
	query: string,
	limit = 20
): Array<{ id: string; name: string; nickName: string | null; gender: string | null }> {
	const q = query.trim().toLowerCase();
	if (!q) return [];

	const matches: Array<{
		id: string;
		name: string;
		nickName: string | null;
		gender: string | null;
	}> = [];
	for (const p of blob.profiles) {
		const name = [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
		const haystack = `${name} ${p.nickName ?? ""} ${p.email ?? ""}`.toLowerCase();
		if (haystack.includes(q)) {
			matches.push({ id: p.id, name, nickName: p.nickName, gender: p.gender });
			if (matches.length >= limit) break;
		}
	}
	return matches;
}
