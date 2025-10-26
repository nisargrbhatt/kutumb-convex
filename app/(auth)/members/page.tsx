import { api } from "@/convex/_generated/api";
import { Metadata, NextPage } from "next";
import { DataTable } from "./__components/MembersDataTable";
import { columns } from "./__components/MembersColumns";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getServerSession, getToken } from "@/lib/auth-server";
import { fetchQuery } from "convex/nextjs";

export const metadata: Metadata = {
  title: "Members List",
};

const MembersPage: NextPage = async () => {
  await getServerSession({ redirectUrl: "/members" });
  const token = await getToken();
  const members = await fetchQuery(api.profile.listMembers, {}, { token });

  return (
    <div className="w-full flex flex-col justify-start items-start gap-2">
      <div className="flex flex-col items-start justify-start">
        <h2 className="font-bold text-2xl">Members List</h2>
        <p className="text-muted-foreground">
          List of all the member of our family
        </p>
        <Link href="/members/create">
          <Button
            type="button"
            variant="default"
            className="mt-2"
            title="Add missing member's information"
          >
            Add Member
          </Button>
        </Link>
      </div>
      <div className="w-full">
        <DataTable columns={columns} data={members} />
      </div>
    </div>
  );
};

export default MembersPage;
