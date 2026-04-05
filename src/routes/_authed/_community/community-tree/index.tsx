import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { getCommunityTreeQuery } from "@/api/communityProfile";
import {
	ReactFlow,
	Controls,
	Background,
	useNodesState,
	useEdgesState,
	Handle,
	Position,
	Panel,
	type Node,
	type Edge,
	type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { useEffect, useCallback, useMemo } from "react";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authed/_community/community-tree/")({
	loaderDeps: () => ({}),
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(getCommunityTreeQuery());
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

function MemberNode({ data }: NodeProps) {
	return (
		<Card className="w-[380px] overflow-visible rounded-2xl border-muted-foreground/20 bg-background shadow-sm">
			<CardContent className="flex flex-row items-center justify-between p-5">
				<Handle
					type="target"
					position={Position.Left}
					className="h-2 w-2 border-none bg-muted-foreground/50!"
				/>
				<div className="flex flex-1 flex-col gap-1 overflow-hidden pr-4">
					<span className="truncate text-base font-semibold">
						{typeof data.name === "string" ? data.name : "No name provided"}
					</span>
					<span className="truncate text-sm text-muted-foreground">
						{typeof data.email === "string" ? data.email : "No email provided"}
					</span>
				</div>
				{/* Just a stylized text for now since we don't have the exact profile route mapped easily */}
				<Route.Link
					to={"/members"}
					className="text-sm font-semibold whitespace-nowrap text-purple-600 hover:text-purple-700"
				>
					View Profile
				</Route.Link>
				<Handle
					type="source"
					position={Position.Right}
					className="h-2 w-2 border-none bg-muted-foreground/50!"
				/>
			</CardContent>
		</Card>
	);
}

const nodeTypes = {
	member: MemberNode,
};

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 400;
const nodeHeight = 120;

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = "LR") => {
	const isHorizontal = direction === "LR";
	dagreGraph.setGraph({ rankdir: direction, align: "UL", ranksep: 100, nodesep: 50 });

	nodes.forEach((node) => {
		dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
	});

	edges.forEach((edge) => {
		dagreGraph.setEdge(edge.source, edge.target);
	});

	dagre.layout(dagreGraph);

	const newNodes = nodes.map((node) => {
		const nodeWithPosition = dagreGraph.node(node.id);
		const newNode = {
			...node,
			targetPosition: isHorizontal ? Position.Left : Position.Top,
			sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
			position: {
				x: nodeWithPosition.x - nodeWidth / 2,
				y: nodeWithPosition.y - nodeHeight / 2,
			},
		};

		return newNode;
	});

	return { nodes: newNodes, edges };
};

function capitalizeFirstLetter(string: string) {
	if (!string) return "";
	return string.charAt(0).toUpperCase() + string.slice(1).replace(/_/g, " ");
}

function RouteComponent() {
	const { data } = useSuspenseQuery(getCommunityTreeQuery());

	const initialNodes: Node[] = useMemo(
		() =>
			data.profiles.map((p) => ({
				id: p.id,
				type: "member",
				data: {
					id: p.id,
					name: [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" "),
					email: p.email,
					gender: p.gender,
				},
				position: { x: 0, y: 0 },
			})),
		[data.profiles]
	);

	const initialEdges: Edge[] = useMemo(
		() =>
			data.relations.map((r) => ({
				id: r.id,
				source: r.fromId as string,
				target: r.toId as string,
				type: "smoothstep",
				label: capitalizeFirstLetter(r.type || "Relation"),
				labelBgPadding: [12, 6] as [number, number],
				labelBgBorderRadius: 16,
				labelBgStyle: { fill: "#8b5cf6", fillOpacity: 1 },
				labelStyle: { fill: "#ffffff", fontWeight: 600, fontSize: 11 },
				animated: false,
				style: { stroke: "#cbd5e1", strokeWidth: 1.5 },
			})),
		[data.relations]
	);

	const [nodes, setNodes] = useNodesState(initialNodes);
	const [edges, setEdges] = useEdgesState(initialEdges);

	const onLayout = useCallback(
		(direction: string) => {
			const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
				initialNodes,
				initialEdges,
				direction
			);

			setNodes([...layoutedNodes]);
			setEdges([...layoutedEdges]);
		},
		[initialNodes, initialEdges, setNodes, setEdges]
	);

	// Run layout once on mount
	useEffect(() => {
		if (initialNodes.length > 0) {
			onLayout("LR");
		}
	}, [initialNodes, onLayout]);

	return (
		<div className="flex h-full w-full flex-col items-start justify-start gap-4 p-2">
			<PageHeader />

			<div className="flex w-full flex-col pt-4">
				<h2 className="text-lg font-medium">Family Tree</h2>
				<p className="text-sm text-muted-foreground">
					List of all the members of our family and their relationships
				</p>
			</div>

			<div className="min-h-[600px] w-full flex-1 overflow-hidden rounded-md border bg-background">
				<ReactFlow
					nodes={nodes}
					edges={edges}
					nodeTypes={nodeTypes}
					fitView
					minZoom={0.2}
					maxZoom={4}
					attributionPosition="bottom-right"
				>
					<Panel position="top-right" className="flex gap-2">
						<button
							onClick={() => onLayout("TB")}
							className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-muted"
						>
							Vertical Layout
						</button>
						<button
							onClick={() => onLayout("LR")}
							className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-muted"
						>
							Horizontal Layout
						</button>
					</Panel>
					<Controls />
					<Background color="#ccc" gap={20} size={1.5} />
				</ReactFlow>
			</div>
		</div>
	);
}
