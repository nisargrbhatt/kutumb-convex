import { Badge } from "@/components/ui/badge";
import { api } from "@/convex/_generated/api";
import {
  BaseEdge,
  Edge,
  EdgeLabelRenderer,
  EdgeProps,
  getBezierPath,
} from "@xyflow/react";

import type { FC } from "react";

type RelationObject =
  (typeof api.relations.familyTreeRelations)["_returnType"][number];

const RelationNameMap: Record<RelationObject["type"], string> = {
  brother: "Brother",
  brother_in_law: "Brother-in-law",
  child: "Child",
  father: "Father",
  father_in_law: "Father-in-law",
  mother: "Mother",
  mother_in_law: "Mother-in-law",
  sister: "Sister",
  sister_in_law: "Sister-in-law",
  wife: "Wife",
  husband: "Husband",
  uncle: "Uncle",
  aunt: "Aunt",
};

export type DataProps = RelationObject;

type Props = Edge<DataProps, "relation">;

const RelationEdge: FC<EdgeProps<Props>> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} />
      <EdgeLabelRenderer>
        <div
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
          }}
          className="edge-label-renderer__custom-edge nodrag nopan w-fit "
        >
          <Badge>{RelationNameMap[data?.type ?? "brother"]}</Badge>
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

export default RelationEdge;
