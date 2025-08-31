"use client";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import type { FC } from "react";
import RelationshipCard from "./RelationshipCard";
import RelationshipForm from "./RelationshipForm";

type ProfileObject = NonNullable<
  (typeof api.profile.getProfile)["_returnType"]["profile"]
>;

interface Props {
  profileId: ProfileObject["_id"];
}

const RelationshipList: FC<Props> = ({ profileId }) => {
  const relations = useQuery(api.relations.listMyRelations);

  if (relations === undefined) {
    return <p>Loading...</p>;
  }

  return (
    <div className="w-full flex flex-col justify-start items-start gap-2">
      <div className="flex flex-col items-start justify-start">
        {profileId ? <RelationshipForm profileId={profileId} /> : null}
      </div>
      {relations?.length > 0 ? (
        <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-2">
          {relations?.map((relation) =>
            profileId ? (
              <RelationshipCard
                relation={relation}
                key={relation._id}
                profileId={profileId}
              />
            ) : null,
          )}
        </div>
      ) : null}

      {relations && relations?.length < 1 ? (
        <p className="w-full text-center text-sm text-muted-foreground">
          No Relations Found
        </p>
      ) : null}
    </div>
  );
};

export default RelationshipList;
