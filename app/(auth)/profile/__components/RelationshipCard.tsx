"use client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  DeleteIcon,
} from "lucide-react";
import { useState, type FC } from "react";

type RelationObject =
  (typeof api.relations.listMyRelations)["_returnType"][number];

interface Props {
  relation: RelationObject;
  profileId: string;
}

const RelationshipCard: FC<Props> = ({ relation, profileId }) => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const deleteRelationAction = useMutation(api.relations.deleteMyRelation);

  const onSubmit = async () => {
    setIsLoading(() => true);
    await deleteRelationAction({ id: relation._id });
    setIsLoading(() => false);
  };

  return (
    <div className="w-full flex flex-col justify-start items-start gap-2 border rounded p-2">
      <div className="flex w-full flex-col lg:flex-row justify-evenly items-center gap-2 ">
        <div className="flex flex-col justify-start items-center gap-1">
          <Avatar>
            <AvatarImage src={relation.fromProfile?.picture} />
            <AvatarFallback>
              {relation.fromProfile?.firstName?.at(0)?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <p className="text-sm font-medium">
            {[
              relation.fromProfile?.firstName,
              relation.fromProfile?.middleName,
              relation.fromProfile?.lastName,
            ]
              .filter(Boolean)
              .join(" ")}
          </p>
          <p className="text-xs text-muted-foreground">
            {relation.fromProfile?.email}
          </p>
        </div>

        <div className="flex flex-col lg:flex-row justify-center items-center gap-1">
          <ArrowLeft className="w-4 h-4 hidden lg:block" />
          <ArrowUp className="w-4 h-4 block lg:hidden" />
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-sm font-medium capitalize">{relation.type}</p>
            </TooltipTrigger>
            <TooltipContent>
              <p>{relation.type}</p>
              <p>{relation.note}</p>
            </TooltipContent>
          </Tooltip>

          <ArrowDown className="w-4 h-4 block lg:hidden" />
          <ArrowRight className="w-4 h-4 hidden lg:block" />
        </div>

        <div className="flex flex-col justify-start items-center gap-1">
          <Avatar>
            <AvatarImage src={relation.toProfile?.picture} />
            <AvatarFallback>
              {relation.toProfile?.firstName?.at(0)?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <p className="text-sm font-medium">
            {[
              relation.toProfile?.firstName,
              relation.toProfile?.middleName,
              relation.toProfile?.lastName,
            ]
              .filter(Boolean)
              .join(" ")}
          </p>
          <p className="text-xs text-muted-foreground">
            {relation.toProfile?.email}
          </p>
        </div>
      </div>
      {profileId === relation.fromProfileId ? (
        <Button
          type="button"
          variant="destructive"
          title="Delete relation"
          size="icon"
          onClick={onSubmit}
          disabled={isLoading}
        >
          <DeleteIcon />
        </Button>
      ) : null}
    </div>
  );
};

export default RelationshipCard;
