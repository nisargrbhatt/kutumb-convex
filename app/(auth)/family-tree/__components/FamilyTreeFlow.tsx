"use client";
import { useMemo, type FC } from "react";
import { api } from "@/convex/_generated/api";
import CustomProfileNode, { DataProps } from "./CustomProfileNode";
import RelationEdge from "./RelationEdge";
import {
  Node,
  ReactFlow,
  useEdgesState,
  useNodesState,
  Position,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import { useTheme } from "next-themes";

type ProfileObject =
  (typeof api.profile.familyTreeProfileList)["_returnType"][number];
type RelationObject =
  (typeof api.relations.familyTreeRelations)["_returnType"][number];

const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));

const nodeWidth = 500;
const nodeHeight = 150;

const getLayoutedElements = (
  nodes: Node<DataProps, "profile">[],
  edges: any[],
) => {
  dagreGraph.setGraph({ rankdir: "LR" });

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
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
      // We are shifting the dagre node position (anchor=center center) to the top left
      // so it matches the React Flow node anchor point (top left).
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };

    return newNode;
  });

  return { nodes: newNodes, edges };
};

interface Props {
  profiles: ProfileObject[];
  relations: RelationObject[];
}

const nodeTypes = {
  profile: CustomProfileNode,
};

const edgeTypes = {
  relation: RelationEdge,
};

const FamilyTreeFlow: FC<Props> = ({ profiles, relations }) => {
  const { theme } = useTheme();
  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(() => {
    return getLayoutedElements(
      profiles?.map((profile) => ({
        id: profile._id,
        type: "profile",
        data: profile,
        position: { x: 0, y: 0 },
      })) ?? [],
      relations?.map((relation) => ({
        id: relation._id,
        source: relation.fromProfileId,
        target: relation.toProfileId,
        type: "relation",
        data: relation,
      })) ?? [],
    );
  }, [profiles, relations]);

  const [nodes, _setNodes] = useNodesState(layoutedNodes);
  const [edges, _setEdges] = useEdgesState(layoutedEdges);

  return (
    <div className="w-full h-[60vh]">
      <ReactFlow
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodes={nodes}
        edges={edges}
        fitView
        colorMode={theme as any}
      >
        <Background variant={BackgroundVariant.Dots} />
        <Controls />
      </ReactFlow>
    </div>
  );
};

export default FamilyTreeFlow;
