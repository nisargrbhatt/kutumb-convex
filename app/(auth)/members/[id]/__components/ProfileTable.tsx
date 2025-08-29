import { api } from "@/convex/_generated/api";
import type { FC } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type ProfileObject = NonNullable<
  (typeof api.profile.getProfileDetail)["_returnType"]
>["profile"];

interface Props {
  profile: ProfileObject;
}

const ProfileTable: FC<Props> = ({ profile }) => {
  const fullName = [
    profile?.firstName,
    profile?.middleName ?? "",
    profile?.lastName,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <Avatar className="w-[250px] h-[250px]">
        <AvatarImage src={profile?.picture ?? undefined} />
        <AvatarFallback>{fullName?.at(0)?.toUpperCase()}</AvatarFallback>
      </Avatar>
      <Table>
        <TableBody>
          <TableRow>
            <TableCell className="font-medium">Name</TableCell>
            <TableCell>{fullName}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="font-medium">Nickname</TableCell>
            <TableCell>{profile?.nickName ?? "-"}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="font-medium">Email</TableCell>
            <TableCell>{profile?.email ?? "-"}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="font-medium">Mobile Number</TableCell>
            <TableCell>{profile?.mobileNumber ?? "-"}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="font-medium">Date of Birth</TableCell>
            <TableCell>
              {profile?.dateOfBirth ? format(profile.dateOfBirth, "PPP") : "-"}
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="font-medium">Date of Death</TableCell>
            <TableCell>
              {profile?.dateOfDeath ? format(profile.dateOfDeath, "PPP") : "-"}
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="font-medium">Gender</TableCell>
            <TableCell className="capitalize">
              {profile?.gender ?? "-"}
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="font-medium">Blood Group</TableCell>
            <TableCell>{profile?.bloodGroup ?? "-"}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="font-medium">Gotra</TableCell>
            <TableCell>{profile?.gotra ?? "-"}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="font-medium">Native</TableCell>
            <TableCell>{profile?.native ?? "-"}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="font-medium">Maternal</TableCell>
            <TableCell>{profile?.maternal ?? "-"}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="font-medium">Birth Place</TableCell>
            <TableCell>{profile?.birthPlace ?? "-"}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="font-medium">Relationship</TableCell>
            <TableCell className="capitalize">
              {profile?.relationship ?? "-"}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
};

export default ProfileTable;
