import { z } from "zod";
import type { QueryDb } from "@/domain/queries/db";
import { fullName, genderSchema, profileStatusSchema } from "@/domain/communityProfile";
import { AppError } from "@/domain/errors";
import type { Actor } from "@/domain/permission";
import { relationTypeSchema } from "@/domain/relation";
import { extractSubgraph, getOrgGraphBlob } from "@/lib/communityGraphCache";

export const MAX_GRAPH_NODES = 200;
const DEFAULT_DEPTH = 2;
const MAX_DEPTH = 3;

export const getFamilyGraphInput = z.object({
	focusId: z
		.string()
		.min(1)
		.optional()
		.describe("Community Profile id to centre on. Defaults to your own profile."),
	depth: z
		.number()
		.int()
		.optional()
		.describe(
			`Relation hops from the focus. Default ${DEFAULT_DEPTH}, clamped to 1..${MAX_DEPTH}.`
		),
});

export const getFamilyGraphOutput = z.object({
	nodes: z
		.array(
			z.object({
				id: z.string().describe("Community Profile id; pass to get_profile."),
				fullName: z.string(),
				nickName: z.string().nullable(),
				gender: genderSchema.nullable(),
				status: profileStatusSchema,
			})
		)
		.describe("Focus first, then nearest relations first."),
	edges: z.array(
		z.object({
			fromId: z.string(),
			toId: z.string(),
			type: relationTypeSchema.nullable(),
		})
	),
	truncated: z
		.boolean()
		.describe(`True when more than ${MAX_GRAPH_NODES} nodes matched; farthest were dropped.`),
});

export const getFamilyGraphDescription = `Returns the family graph around one Community Profile: the people within \`depth\` relation hops (default ${DEFAULT_DEPTH}, max ${MAX_DEPTH}) and the relations between them. Use it to answer "how are X and Y related" or "who is in X's family"; call get_profile for a person's details.

Each edge is stored in one direction and is NEVER inverted: \`to\` is \`from\`'s \`<type>\`. Example: {fromId: Jared, toId: Anna, type: "sister"} means Anna is Jared's sister; {fromId: Mia, toId: Jared, type: "brother"} means Jared is Mia's brother. Edges are not mirrored, so for "Jared's sisters" read edges in both directions and use node gender.

Only active profiles appear. \`focusId\` defaults to your own profile; if you have none, pass one (find it with search_profiles). Output is capped at ${MAX_GRAPH_NODES} nodes, nearest first; \`truncated\` says whether any were dropped.`;

type View = z.input<typeof getFamilyGraphOutput>;

export async function getFamilyGraph(
	db: QueryDb,
	actor: Actor,
	input: z.output<typeof getFamilyGraphInput>
): Promise<View> {
	const depth = Math.min(MAX_DEPTH, Math.max(1, input.depth ?? DEFAULT_DEPTH));

	let focusId = input.focusId;
	if (!focusId) {
		const own = await db.query.communityProfile.findFirst({
			where: (f, o) =>
				o.and(o.eq(f.organizationId, actor.organizationId), o.eq(f.userId, actor.userId)),
			columns: { id: true },
		});
		if (!own) {
			throw new AppError(
				"NotFound",
				"You have no Community Profile in this community; pass focusId (find one with search_profiles)"
			);
		}
		focusId = own.id;
	}

	const blob = await getOrgGraphBlob(actor.organizationId);
	const sub = extractSubgraph(blob, focusId, depth);
	if (!sub.anchorId) {
		throw new AppError("NotFound", "Community Profile not found or not active");
	}

	const kept = sub.nodes.slice(0, MAX_GRAPH_NODES);
	const keptIds = new Set(kept.map((n) => n.id));
	return {
		nodes: kept.map((n) => ({
			id: n.id,
			fullName: fullName(n),
			nickName: n.nickName,
			gender: n.gender as View["nodes"][number]["gender"],
			status: "active",
		})),
		edges: sub.edges
			.filter((e) => keptIds.has(e.from) && keptIds.has(e.to))
			.map((e) => ({ fromId: e.from, toId: e.to, type: e.type as View["edges"][number]["type"] })),
		truncated: sub.nodes.length > MAX_GRAPH_NODES,
	};
}
