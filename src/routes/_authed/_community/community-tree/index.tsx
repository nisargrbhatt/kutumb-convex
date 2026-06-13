import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
	getFocusedCommunityGraphQuery,
	searchCommunityProfilesLiteQuery,
} from "@/api/communityProfile";
import type { GraphEdge, SubgraphNode } from "@/lib/communityGraphCache";
import {
	ReactFlow,
	ReactFlowProvider,
	Controls,
	Background,
	BaseEdge,
	EdgeLabelRenderer,
	useNodesState,
	useEdgesState,
	useReactFlow,
	Handle,
	Position,
	Panel,
	type Node,
	type Edge,
	type NodeProps,
	type EdgeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { layoutGraph, type Point, type RelationEdgeData } from "@/lib/communityGraphLayout";
import { useEffect, useCallback, useMemo, useState } from "react";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { useIsMobile } from "@/hooks/use-mobile";
import { IconExternalLink, IconHome, IconSearch } from "@tabler/icons-react";

const DEFAULT_DEPTH = 2;
const EXPAND_CAP = 300;

export const Route = createFileRoute("/_authed/_community/community-tree/")({
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(getFocusedCommunityGraphQuery());
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
						<BreadcrumbPage>Community Tree</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
		</div>
	);
}

function capitalizeFirstLetter(string: string) {
	if (!string) return "";
	return string.charAt(0).toUpperCase() + string.slice(1).replace(/_/g, " ");
}

function fullName(p: { firstName: string; middleName?: string | null; lastName: string }) {
	return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
}

function initials(name: string) {
	const parts = name.trim().split(/\s+/);
	const first = parts[0]?.[0] ?? "";
	const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
	return (first + last).toUpperCase() || "?";
}

function usePrefersReducedMotion() {
	const [reduced, setReduced] = useState(false);
	useEffect(() => {
		const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
		setReduced(mq.matches);
		const onChange = () => setReduced(mq.matches);
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, []);
	return reduced;
}

type MemberNodeData = {
	name: string;
	nickName: string | null;
	hop: number;
	deceased: boolean;
	isAnchor: boolean;
	isBoundary: boolean;
	isHighlighted: boolean;
	reducedMotion: boolean;
};

function MemberNode({ data }: NodeProps) {
	const d = data as MemberNodeData;
	const [visible, setVisible] = useState(d.reducedMotion);

	useEffect(() => {
		if (d.reducedMotion) return;
		const t = setTimeout(() => setVisible(true), 10);
		return () => clearTimeout(t);
	}, [d.reducedMotion]);

	return (
		<div
			className="transition-all duration-300 ease-out"
			style={{
				opacity: visible ? 1 : 0,
				transform: visible ? "scale(1)" : "scale(0.92)",
				transitionDelay: d.reducedMotion ? "0ms" : `${Math.min(d.hop, 4) * 70}ms`,
			}}
		>
			<Handle
				type="target"
				position={Position.Left}
				className="h-2 w-2 border-none bg-muted-foreground/50!"
			/>
			<div
				className={[
					"flex w-[200px] flex-row items-center gap-3 rounded-xl border bg-background px-3 py-2 shadow-sm",
					d.isAnchor ? "border-violet-500 ring-2 ring-violet-500/30" : "border-muted-foreground/20",
					d.isHighlighted ? "ring-2 ring-amber-400" : "",
					d.deceased ? "opacity-80" : "",
				].join(" ")}
			>
				<Avatar className="h-9 w-9 shrink-0">
					<AvatarFallback className="text-xs font-medium">{initials(d.name)}</AvatarFallback>
				</Avatar>
				<div className="flex flex-1 flex-col overflow-hidden">
					<span className="truncate text-sm leading-tight font-semibold">{d.name}</span>
					{d.nickName ? (
						<span className="truncate text-xs text-muted-foreground">“{d.nickName}”</span>
					) : d.deceased ? (
						<span className="truncate text-xs text-muted-foreground">Deceased</span>
					) : null}
				</div>
				{d.isBoundary ? (
					<span
						className="h-2 w-2 shrink-0 rounded-full bg-violet-500"
						title="Click to expand relations"
					/>
				) : null}
			</div>
			<Handle
				type="source"
				position={Position.Right}
				className="h-2 w-2 border-none bg-muted-foreground/50!"
			/>
		</div>
	);
}

const nodeTypes = { member: MemberNode };

const ARROW_MARKER_ID = "tree-relation-arrow";

// Build an orthogonal SVG path through ELK's bend points with rounded corners (~8px).
function roundedOrthogonalPath(points: Point[], radius = 8): string {
	if (points.length === 0) return "";
	if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

	let d = `M ${points[0].x} ${points[0].y}`;
	for (let i = 1; i < points.length - 1; i++) {
		const prev = points[i - 1];
		const curr = points[i];
		const next = points[i + 1];

		const dIn = Math.hypot(curr.x - prev.x, curr.y - prev.y);
		const dOut = Math.hypot(next.x - curr.x, next.y - curr.y);
		const r = Math.min(radius, dIn / 2, dOut / 2);

		const inX = curr.x - ((curr.x - prev.x) / (dIn || 1)) * r;
		const inY = curr.y - ((curr.y - prev.y) / (dIn || 1)) * r;
		const outX = curr.x + ((next.x - curr.x) / (dOut || 1)) * r;
		const outY = curr.y + ((next.y - curr.y) / (dOut || 1)) * r;

		d += ` L ${inX} ${inY} Q ${curr.x} ${curr.y} ${outX} ${outY}`;
	}
	const last = points[points.length - 1];
	d += ` L ${last.x} ${last.y}`;
	return d;
}

// Custom edge that renders ELK's computed route + collision-free label position.
function RelationEdge({ id, data, style }: EdgeProps) {
	const d = data as RelationEdgeData | undefined;
	const geometry = d?.geometry;
	if (!geometry || geometry.points.length < 2) return null;

	const path = roundedOrthogonalPath(geometry.points);

	return (
		<>
			<BaseEdge id={id} path={path} markerEnd={`url(#${ARROW_MARKER_ID})`} style={style} />
			{d?.label && geometry.labelPos ? (
				<EdgeLabelRenderer>
					<div
						className="pointer-events-none absolute rounded-full bg-violet-500 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm"
						style={{
							transform: `translate(-50%, -50%) translate(${geometry.labelPos.x}px, ${geometry.labelPos.y}px)`,
						}}
					>
						{d.label}
					</div>
				</EdgeLabelRenderer>
			) : null}
		</>
	);
}

const edgeTypes = { relation: RelationEdge };

function SearchBox(props: { onSelect: (id: string) => void }) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const { data: results } = useQuery(searchCommunityProfilesLiteQuery(query));

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button variant="outline" size="sm" className="gap-2">
					<IconSearch className="size-4" />
					Search
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-72 p-0" align="end">
				<Command shouldFilter={false}>
					<CommandInput placeholder="Search members…" value={query} onValueChange={setQuery} />
					<CommandList>
						<CommandEmpty>{query.trim() ? "No matches" : "Type to search"}</CommandEmpty>
						<CommandGroup>
							{(results ?? []).map((r) => (
								<CommandItem
									key={r.id}
									value={r.id}
									onSelect={() => {
										props.onSelect(r.id);
										setOpen(false);
										setQuery("");
									}}
								>
									<div className="flex flex-col">
										<span className="text-sm">{r.name}</span>
										{r.nickName ? (
											<span className="text-xs text-muted-foreground">“{r.nickName}”</span>
										) : null}
									</div>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

function InfoRow(props: { label: string; value: string | null | undefined }) {
	if (!props.value) return null;
	return (
		<div className="flex flex-col gap-0.5">
			<span className="text-xs text-muted-foreground">{props.label}</span>
			<span className="text-sm">{props.value}</span>
		</div>
	);
}

function ProfilePanel(props: {
	node: SubgraphNode | null;
	relationLabel: string | null;
	onOpenChange: (open: boolean) => void;
}) {
	const isMobile = useIsMobile();
	const node = props.node;
	const name = node ? fullName(node) : "";

	return (
		<Sheet open={!!node} onOpenChange={props.onOpenChange}>
			<SheetContent side={isMobile ? "bottom" : "right"} className="gap-0">
				{node ? (
					<>
						<SheetHeader>
							<div className="flex items-center gap-3">
								<Avatar className="h-12 w-12">
									<AvatarFallback>{initials(name)}</AvatarFallback>
								</Avatar>
								<div className="flex flex-col">
									<SheetTitle className="text-base">{name}</SheetTitle>
									<SheetDescription>
										{node.nickName ? `“${node.nickName}”` : "Community member"}
									</SheetDescription>
								</div>
							</div>
						</SheetHeader>
						<div className="flex flex-col gap-3 px-4">
							{props.relationLabel ? (
								<Badge variant="secondary" className="w-fit">
									{props.relationLabel}
								</Badge>
							) : null}
							<InfoRow label="Nickname" value={node.nickName} />
							<InfoRow
								label="Gender"
								value={node.gender ? capitalizeFirstLetter(node.gender) : null}
							/>
							<InfoRow label="Blood group" value={node.bloodGroup} />
							<InfoRow label="Date of birth" value={node.dateOfBirth} />
							<InfoRow label="Date of death" value={node.dateOfDeath} />
							<InfoRow label="Email" value={node.email} />
							<InfoRow label="Mobile" value={node.mobileNumber} />
							<Route.Link to={"/members/$id"} params={{ id: node.id }} className="pt-2">
								<Button variant="outline" size="sm" className="w-full gap-2">
									<IconExternalLink className="size-4" />
									Open full profile
								</Button>
							</Route.Link>
						</div>
					</>
				) : null}
			</SheetContent>
		</Sheet>
	);
}

function Flow() {
	const reducedMotion = usePrefersReducedMotion();
	const queryClient = useQueryClient();
	const { fitView } = useReactFlow();

	const [focusId, setFocusId] = useState<string | undefined>(undefined);
	const [direction, setDirection] = useState<"LR" | "TB">("LR");
	const [highlightId, setHighlightId] = useState<string | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);

	// Base subgraph for the current anchor (server BFS over cached org blob).
	const { data: base } = useSuspenseQuery(
		getFocusedCommunityGraphQuery({ focusId, depth: DEFAULT_DEPTH })
	);

	// Additive expansions merged client-side. Reset whenever the anchor changes (re-root).
	const [extraNodes, setExtraNodes] = useState<SubgraphNode[]>([]);
	const [extraEdges, setExtraEdges] = useState<GraphEdge[]>([]);
	const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
	useEffect(() => {
		setExtraNodes([]);
		setExtraEdges([]);
		setExpandedIds(new Set());
	}, [base.anchorId]);

	// Combine base + extras, dedupe by id.
	const { combinedNodes, combinedEdges } = useMemo(() => {
		const nodeMap = new Map<string, SubgraphNode>();
		for (const n of base.nodes) nodeMap.set(n.id, n);
		for (const n of extraNodes) if (!nodeMap.has(n.id)) nodeMap.set(n.id, n);

		const edgeMap = new Map<string, GraphEdge>();
		for (const e of [...base.edges, ...extraEdges]) edgeMap.set(e.id, e);

		return {
			combinedNodes: [...nodeMap.values()],
			combinedEdges: [...edgeMap.values()],
		};
	}, [base, extraNodes, extraEdges]);

	const nodeById = useMemo(() => new Map(combinedNodes.map((n) => [n.id, n])), [combinedNodes]);

	const initialNodes: Node[] = useMemo(
		() =>
			combinedNodes.map((p) => ({
				id: p.id,
				type: "member",
				data: {
					name: fullName(p),
					nickName: p.nickName,
					hop: p.hop,
					deceased: !!p.dateOfDeath,
					isAnchor: p.id === base.anchorId,
					isBoundary: p.isBoundary && !expandedIds.has(p.id),
					isHighlighted: p.id === highlightId,
					reducedMotion,
				} satisfies MemberNodeData,
				position: { x: 0, y: 0 },
			})),
		[combinedNodes, base.anchorId, expandedIds, highlightId, reducedMotion]
	);

	const initialEdges: Edge[] = useMemo(
		() =>
			combinedEdges.map((r) => ({
				id: r.id,
				source: r.from,
				target: r.to,
				type: "relation",
				data: { label: capitalizeFirstLetter(r.type || "Relation") } satisfies RelationEdgeData,
				style: { stroke: "#94a3b8", strokeWidth: 1.5 },
			})),
		[combinedEdges]
	);

	const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
	const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

	// Re-layout (async via ELK) whenever the combined graph or direction changes, then fit the view.
	// Stale-guard: ignore a layout result if a newer relayout started before it resolved.
	useEffect(() => {
		if (initialNodes.length === 0) {
			setNodes([]);
			setEdges([]);
			return;
		}
		let cancelled = false;
		let fitTimer: ReturnType<typeof setTimeout> | undefined;

		void layoutGraph(initialNodes, initialEdges, direction)
			.then(({ nodes: ln, edges: le }) => {
				if (cancelled) return;
				setNodes(ln);
				setEdges(le);
				fitTimer = setTimeout(
					() => fitView({ duration: reducedMotion ? 0 : 500, padding: 0.2 }),
					0
				);
			})
			.catch((err) => {
				console.error("Error occurred while layoutGraph:", err);
			});
		return () => {
			cancelled = true;
			if (fitTimer) clearTimeout(fitTimer);
		};
	}, [initialNodes, initialEdges, direction, setNodes, setEdges, fitView, reducedMotion]);

	const reRoot = useCallback((id: string) => {
		setFocusId(id);
		setSelectedId(null);
		setHighlightId(id);
	}, []);

	const expand = useCallback(
		async (id: string) => {
			if (expandedIds.has(id)) return;
			if (nodeById.size >= EXPAND_CAP) {
				// Canvas too large — re-root instead of growing unbounded.
				reRoot(id);
				return;
			}
			const sub = await queryClient.fetchQuery(
				getFocusedCommunityGraphQuery({ focusId: id, depth: 1 })
			);
			const baseMaxHop = Math.max(0, ...combinedNodes.map((n) => n.hop));
			const offsetNodes = sub.nodes.map((n) => ({ ...n, hop: baseMaxHop + n.hop }));
			setExtraNodes((prev) => [...prev, ...offsetNodes]);
			setExtraEdges((prev) => [...prev, ...sub.edges]);
			setExpandedIds((prev) => new Set(prev).add(id));
		},
		[expandedIds, nodeById, queryClient, combinedNodes, reRoot]
	);

	const onNodeClick = useCallback(
		(_: React.MouseEvent, node: Node) => {
			setSelectedId(node.id);
			const data = node.data as MemberNodeData;
			if (data.isBoundary) void expand(node.id);
		},
		[expand]
	);

	const onNodeDoubleClick = useCallback(
		(_: React.MouseEvent, node: Node) => reRoot(node.id),
		[reRoot]
	);

	const selectedNode = selectedId ? (nodeById.get(selectedId) ?? null) : null;

	// Relation-to-anchor label, if the selected node connects directly to the anchor.
	const relationLabel = useMemo(() => {
		if (!selectedNode || !base.anchorId || selectedNode.id === base.anchorId) return null;
		const edge = combinedEdges.find(
			(e) =>
				(e.from === base.anchorId && e.to === selectedNode.id) ||
				(e.to === base.anchorId && e.from === selectedNode.id)
		);
		return edge?.type ? capitalizeFirstLetter(edge.type) : null;
	}, [selectedNode, base.anchorId, combinedEdges]);

	const isEmpty = combinedNodes.length === 0;

	return (
		<>
			{/* Arrowhead marker referenced by RelationEdge (kept in the document so url(#…) resolves). */}
			<svg className="absolute h-0 w-0" aria-hidden>
				<defs>
					<marker
						id={ARROW_MARKER_ID}
						viewBox="0 0 10 10"
						refX="9"
						refY="5"
						markerWidth="6"
						markerHeight="6"
						orient="auto-start-reverse"
					>
						<path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
					</marker>
				</defs>
			</svg>
			{/* Glide nodes to new ELK positions on relayout, unless the user prefers reduced motion. */}
			{!reducedMotion ? (
				<style>{`.tree-glide .react-flow__node { transition: transform 300ms ease; }`}</style>
			) : null}
			<div className="min-h-[600px] w-full flex-1 overflow-hidden rounded-md border bg-background">
				{isEmpty ? (
					<div className="flex h-full min-h-[600px] flex-col items-center justify-center gap-3 p-6 text-center">
						<p className="text-sm text-muted-foreground">
							No relationships to visualize yet. Add members and relationships to see the tree.
						</p>
						<SearchBox onSelect={reRoot} />
					</div>
				) : (
					<ReactFlow
						nodes={nodes}
						edges={edges}
						onNodesChange={onNodesChange}
						onEdgesChange={onEdgesChange}
						onNodeClick={onNodeClick}
						onNodeDoubleClick={onNodeDoubleClick}
						nodeTypes={nodeTypes}
						edgeTypes={edgeTypes}
						nodesDraggable={false}
						className={reducedMotion ? undefined : "tree-glide"}
						fitView
						minZoom={0.2}
						maxZoom={2}
						onlyRenderVisibleElements
						proOptions={{ hideAttribution: true }}
					>
						<Panel position="top-right" className="flex flex-wrap gap-2">
							<SearchBox onSelect={reRoot} />
							<Button
								variant="outline"
								size="sm"
								className="gap-2"
								onClick={() => setFocusId(undefined)}
							>
								<IconHome className="size-4" />
								My view
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => setDirection((d) => (d === "LR" ? "TB" : "LR"))}
							>
								{direction === "LR" ? "Vertical" : "Horizontal"}
							</Button>
						</Panel>
						<Controls showInteractive={false} />
						<Background color="#ccc" gap={20} size={1.5} />
					</ReactFlow>
				)}
			</div>

			<ProfilePanel
				node={selectedNode}
				relationLabel={relationLabel}
				onOpenChange={(open) => {
					if (!open) setSelectedId(null);
				}}
			/>
		</>
	);
}

function RouteComponent() {
	return (
		<div className="flex h-full w-full flex-col items-start justify-start gap-4 p-2">
			<PageHeader />

			<div className="flex w-full flex-col pt-4">
				<h2 className="text-lg font-medium">Family Tree</h2>
				<p className="text-sm text-muted-foreground">
					Explore your community. Click a member for details, the dot to expand, or double-click to
					recenter.
				</p>
			</div>

			<ReactFlowProvider>
				<Flow />
			</ReactFlowProvider>
		</div>
	);
}
