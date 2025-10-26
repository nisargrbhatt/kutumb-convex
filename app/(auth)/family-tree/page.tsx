import { api } from "@/convex/_generated/api";
import FamilyTreeFlow from "./__components/FamilyTreeFlow";
import { ReactFlowProvider } from "@xyflow/react";
import { Metadata, NextPage } from "next";
import { getServerSession, getToken } from "@/lib/auth-server";
import { fetchQuery } from "convex/nextjs";

export const metadata: Metadata = {
  title: "Family Tree",
};

interface Props {}

const FamilyTress: NextPage<Props> = async () => {
  await getServerSession({ redirectUrl: "/family-tree" });
  const token = await getToken();

  const profiles = await fetchQuery(
    api.profile.familyTreeProfileList,
    {},
    { token },
  );
  const relations = await fetchQuery(
    api.relations.familyTreeRelations,
    {},
    { token },
  );

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
