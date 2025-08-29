"use client";
import type { FC } from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BaseHandle } from "@/components/flow/BaseHandle";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type ProfileObject =
  (typeof api.profile.familyTreeProfileList)["_returnType"][number];

export type DataProps = ProfileObject;

type Props = Node<DataProps, "profile">;

const CustomProfileNode: FC<NodeProps<Props>> = ({ data }) => {
  return (
    <Card className="w-[425px]">
      <CardHeader>
        <CardTitle>
          {[data?.firstName, data?.middleName, data?.lastName]
            .filter(Boolean)
            .join(" ")}
        </CardTitle>
        <CardDescription>{data?.email}</CardDescription>
        <CardAction>
          <Link href={`/members/${data._id}`}>
            <Button type="button" variant={"link"}>
              View Profile
            </Button>
          </Link>
        </CardAction>
      </CardHeader>

      <BaseHandle type="target" position={Position.Left} />
      <BaseHandle type="source" position={Position.Right} />
    </Card>
  );
};

export default CustomProfileNode;
