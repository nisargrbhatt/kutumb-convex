"use client";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import type { FC } from "react";
import FamilyTreeFlow from "./__components/FamilyTreeFlow";
import { ReactFlowProvider } from "@xyflow/react";

interface Props {}

const FamilyTress: FC<Props> = () => {
  const profiles = useQuery(api.profile.familyTreeProfileList);
  const relations = useQuery(api.relations.familyTreeRelations);

  if (profiles === undefined || relations === undefined) {
    return <p>Loading...</p>;
  }

  return (
    <div className="w-full flex flex-col justify-start items-start gap-2">
      <h2 className="font-bold text-2xl">Family Tree</h2>
      <p className="text-muted-foreground">
        List of all the members of our family
      </p>
      <ReactFlowProvider>
        <FamilyTreeFlow profiles={profiles} relations={relations} />
      </ReactFlowProvider>
    </div>
  );
};

export default FamilyTress;
