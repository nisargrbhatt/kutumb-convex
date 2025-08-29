"use client";
import { type FC } from "react";
import { api } from "@/convex/_generated/api";
import CustomProfileNode, { DataProps } from "./CustomProfileNode";
import RelationEdge from "./RelationEdge";
import { Node, ReactFlow, useEdgesState, useNodesState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

type ProfileObject =
  (typeof api.profile.familyTreeProfileList)["_returnType"][number];
type RelationObject =
  (typeof api.relations.familyTreeRelations)["_returnType"][number];

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
  const [nodes, setNodes, onNodesChange] = useNodesState(
    (profiles?.map((profile) => ({
      id: profile._id,
      type: "profile",
      data: profile,
      position: { x: 0, y: 0 },
    })) ?? []) as Node<DataProps, "profile">[],
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    relations?.map((relation) => ({
      id: relation._id,
      source: relation.fromProfileId,
      target: relation.toProfileId,
      type: "relation",
      data: relation,
    })) ?? [],
  );

  return (
    <div className="w-full h-[50vh]">
      <ReactFlow
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
      />
    </div>
  );
};

export default FamilyTreeFlow;
