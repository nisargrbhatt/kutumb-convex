"use client";
import { api } from "@/convex/_generated/api";
import type { FC } from "react";
import RelationshipCard from "./RelationshipCard";

type RelationList = NonNullable<
  (typeof api.profile.getProfileDetail)["_returnType"]
>["relations"];

interface Props {
  relations: RelationList;
}

const RelationshipList: FC<Props> = ({ relations }) => {
  return (
    <div className="w-full flex flex-col justify-start items-start gap-2">
      {relations?.length > 0 ? (
        <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-2">
          {relations?.map((relation) => (
            <RelationshipCard relation={relation} key={relation._id} />
          ))}
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
