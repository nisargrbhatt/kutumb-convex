import type { Node, Edge } from "@xyflow/react";
import { Position } from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";

// ELK-layered layout for the community tree. Replaces dagre: ELK reserves explicit space for
// every edge label and routes orthogonal edges around nodes/labels, so labels never overlap.
// Loaded lazily (main-thread bundle, no separate worker file) to keep it off the initial chunk.

import type { ElkNode, ElkExtendedEdge } from "elkjs/lib/elk-api";

export const NODE_W = 220;
export const NODE_H = 64;

const LABEL_H = 22;
// Rough width of the violet pill: ~6.5px/char + horizontal padding.
function measureLabel(text: string) {
	return { width: Math.max(40, text.length * 6.5 + 20), height: LABEL_H };
}

export type Point = { x: number; y: number };

// ELK geometry stashed onto each edge so the custom RelationEdge can render the exact route + label.
export type RelationEdgeGeometry = {
	points: Point[];
	labelPos: Point | null;
	// Label dimensions, so the renderer can offset the pill clear of the line.
	labelSize: { width: number; height: number } | null;
};

// Anchor the label at the polyline midpoint, nudged perpendicular to the local
// segment so the edge line runs beside the pill (not through it) — makes it
// unambiguous which edge a label belongs to.
export function labelAnchor(
	points: Point[],
	size: { width: number; height: number } | null,
	gap = 6
): Point | null {
	if (points.length < 2) return null;

	const segs: { len: number; a: Point; b: Point }[] = [];
	let total = 0;
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1];
		const b = points[i];
		const len = Math.hypot(b.x - a.x, b.y - a.y);
		if (len === 0) continue;
		segs.push({ len, a, b });
		total += len;
	}
	if (segs.length === 0) return points[0] ?? null;

	let target = total / 2;
	let seg = segs[segs.length - 1];
	for (const s of segs) {
		if (target <= s.len) {
			seg = s;
			break;
		}
		target -= s.len;
	}
	const t = Math.min(1, Math.max(0, target / seg.len));
	const mx = seg.a.x + (seg.b.x - seg.a.x) * t;
	const my = seg.a.y + (seg.b.y - seg.a.y) * t;

	// Unit tangent, then perpendicular (px, py).
	const dx = (seg.b.x - seg.a.x) / seg.len;
	const dy = (seg.b.y - seg.a.y) / seg.len;
	const px = -dy;
	const py = dx;

	const w = size?.width ?? 40;
	const h = size?.height ?? LABEL_H;
	// Clear half the pill's extent along the perpendicular direction, plus a gap.
	const extent = (Math.abs(px) * w + Math.abs(py) * h) / 2 + gap;
	return { x: mx + px * extent, y: my + py * extent };
}

export type RelationEdgeData = {
	label: string;
	geometry?: RelationEdgeGeometry;
};

const layoutOptions = (direction: "LR" | "TB"): Record<string, string> => ({
	"elk.algorithm": "layered",
	"elk.direction": direction === "LR" ? "RIGHT" : "DOWN",
	"elk.edgeRouting": "ORTHOGONAL",
	"elk.layered.spacing.nodeNodeBetweenLayers": "120",
	"elk.spacing.nodeNode": "60",
	"elk.spacing.edgeLabel": "12",
	"elk.layered.spacing.edgeNodeBetweenLayers": "40",
	"elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
	"elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
});

export async function layoutGraph(
	nodes: Node[],
	edges: Edge[],
	direction: "LR" | "TB"
): Promise<{ nodes: Node[]; edges: Edge[] }> {
	const elk = new ELK();

	const elkGraph: ElkNode = {
		id: "root",
		layoutOptions: layoutOptions(direction),
		children: nodes.map((n) => ({ id: n.id, width: NODE_W, height: NODE_H })),
		edges: edges.map((e) => {
			const label = (e.data as RelationEdgeData | undefined)?.label ?? "";
			return {
				id: e.id,
				sources: [e.source],
				targets: [e.target],
				labels: label ? [{ text: label, ...measureLabel(label) }] : [],
			} satisfies ElkExtendedEdge;
		}),
	};

	const res = await elk.layout(elkGraph);

	const posById = new Map<string, Point>();
	for (const c of res.children ?? []) {
		posById.set(c.id, { x: c.x ?? 0, y: c.y ?? 0 });
	}

	const geomById = new Map<string, RelationEdgeGeometry>();
	for (const e of res.edges ?? []) {
		const section = e.sections?.[0];
		const points: Point[] = section
			? [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
			: [];
		const lbl = e.labels?.[0];
		const labelSize = lbl ? { width: lbl.width ?? 40, height: lbl.height ?? LABEL_H } : null;
		// Anchor the pill on the actual route, nudged off the line. Fall back to ELK's box.
		const labelPos =
			labelAnchor(points, labelSize) ??
			(lbl && lbl.x != null && lbl.y != null
				? { x: lbl.x + (lbl.width ?? 0) / 2, y: lbl.y + (lbl.height ?? 0) / 2 }
				: null);
		geomById.set(e.id, { points, labelPos, labelSize });
	}

	const isHorizontal = direction === "LR";
	const laidOutNodes = nodes.map((n) => {
		const pos = posById.get(n.id) ?? { x: 0, y: 0 };
		return {
			...n,
			targetPosition: isHorizontal ? Position.Left : Position.Top,
			sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
			position: { x: pos.x, y: pos.y },
		};
	});

	const laidOutEdges = edges.map((e) => ({
		...e,
		data: {
			...(e.data as RelationEdgeData),
			geometry: geomById.get(e.id),
		} satisfies RelationEdgeData,
	}));

	return { nodes: laidOutNodes, edges: laidOutEdges };
}
