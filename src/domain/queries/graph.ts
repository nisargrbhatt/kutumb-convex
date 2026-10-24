import { and, eq } from "drizzle-orm";
import { communityProfile, communityRelation, orgDataVersion } from "@/db/app-schema";
import { COMMUNITY_PROFILE_STATUS } from "@/db/constants";
import type { BatchDb } from "@/domain/profileChanges";

// One lightweight blob per org caches the whole active graph. Subgraphs, search and expand are
// computed in-worker via BFS over this blob, so the hot path is a version read plus a cache hit.
// Keys are immutable: `graph:{org}:v{n}` where n = orgDataVersion, bumped in every applied
// makeProfileChanges batch. Nothing is ever deleted or overwritten; the KV TTL is GC only.
// See ADR 0008.

export const GRAPH_KV_TTL_SECONDS = 86400; // 24h, garbage collection only
export const GRAPH_LRU_ORGS = 10;

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

/** The slice of Workers KV the cache needs. */
export type GraphKv = {
	get(key: string, type: "json"): Promise<unknown>;
	put(key: string, value: string, options: { expirationTtl: number }): Promise<void>;
};

/** Per-isolate cache: org -> (version, blob). Insertion-ordered Map used as an LRU. */
export type GraphLru = {
	get(organizationId: string): { version: number; blob: OrgGraphBlob } | undefined;
	set(organizationId: string, entry: { version: number; blob: OrgGraphBlob }): void;
	clear(): void;
	readonly size: number;
};

export function createGraphLru(cap = GRAPH_LRU_ORGS): GraphLru {
	const map = new Map<string, { version: number; blob: OrgGraphBlob }>();
	return {
		get(organizationId) {
			const entry = map.get(organizationId);
			if (entry) {
				map.delete(organizationId);
				map.set(organizationId, entry);
			}
			return entry;
		},
		set(organizationId, entry) {
			map.delete(organizationId);
			map.set(organizationId, entry);
			while (map.size > cap) map.delete(map.keys().next().value as string);
		},
		clear: () => map.clear(),
		get size() {
			return map.size;
		},
	};
}

export type GraphDeps = {
	db: BatchDb;
	kv: GraphKv;
	lru: GraphLru;
	waitUntil: (promise: Promise<unknown>) => void;
};

export const graphKey = (organizationId: string, version: number) =>
	`graph:${organizationId}:v${version}`;

const isBlob = (v: unknown): v is OrgGraphBlob =>
	typeof v === "object" &&
	v !== null &&
	Array.isArray((v as OrgGraphBlob).profiles) &&
	Array.isArray((v as OrgGraphBlob).edges);

async function readVersion(db: BatchDb, organizationId: string) {
	const row = await db.query.orgDataVersion.findFirst({
		where: (f, o) => o.eq(f.organizationId, organizationId),
		columns: { version: true },
	});
	return row?.version ?? 0;
}

/** Version + data in one batch (one D1 snapshot): a blob is never newer-keyed than its data. */
async function rebuild(db: BatchDb, organizationId: string) {
	const [versionRows, profiles, relations] = await db.batch([
		db
			.select({ version: orgDataVersion.version })
			.from(orgDataVersion)
			.where(eq(orgDataVersion.organizationId, organizationId)),
		db
			.select({
				id: communityProfile.id,
				firstName: communityProfile.firstName,
				middleName: communityProfile.middleName,
				lastName: communityProfile.lastName,
				nickName: communityProfile.nickName,
				gender: communityProfile.gender,
				bloodGroup: communityProfile.bloodGroup,
				dateOfBirth: communityProfile.dateOfBirth,
				dateOfDeath: communityProfile.dateOfDeath,
				email: communityProfile.email,
				mobileNumber: communityProfile.mobileNumber,
			})
			.from(communityProfile)
			.where(
				and(
					eq(communityProfile.organizationId, organizationId),
					eq(communityProfile.status, COMMUNITY_PROFILE_STATUS.active)
				)
			),
		db
			.select({
				id: communityRelation.id,
				fromId: communityRelation.fromId,
				toId: communityRelation.toId,
				type: communityRelation.type,
			})
			.from(communityRelation)
			.where(eq(communityRelation.organizationId, organizationId)),
	]);

	const activeIds = new Set(profiles.map((p) => p.id));
	// Drop dangling edges and edges touching non-active profiles.
	const edges: GraphEdge[] = relations
		.filter((r) => r.fromId && r.toId && activeIds.has(r.fromId) && activeIds.has(r.toId))
		.map((r) => ({ id: r.id, from: r.fromId as string, to: r.toId as string, type: r.type }));

	return { version: versionRows[0]?.version ?? 0, blob: { profiles, edges } as OrgGraphBlob };
}

/** Version → isolate LRU → KV → D1 rebuild. Zero staleness: every read keys on the live version. */
export async function getOrgGraphBlob(
	{ db, kv, lru, waitUntil }: GraphDeps,
	organizationId: string
): Promise<OrgGraphBlob> {
	const version = await readVersion(db, organizationId);

	const hot = lru.get(organizationId);
	if (hot?.version === version) return hot.blob;

	const cached = await kv.get(graphKey(organizationId, version), "json");
	if (isBlob(cached)) {
		lru.set(organizationId, { version, blob: cached });
		return cached;
	}

	const built = await rebuild(db, organizationId);
	lru.set(organizationId, built);
	waitUntil(
		kv
			.put(graphKey(organizationId, built.version), JSON.stringify(built.blob), {
				expirationTtl: GRAPH_KV_TTL_SECONDS,
			})
			.catch((e: unknown) => console.error("graph cache put failed", e))
	);
	return built.blob;
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
