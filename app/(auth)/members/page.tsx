"use client";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { NextPage } from "next";
import { DataTable } from "./__components/MembersDataTable";
import { columns } from "./__components/MembersColumns";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const MembersPage: NextPage = () => {
  const members = useQuery(api.profile.listMembers);

  if (typeof members === "undefined") {
    return <p>Loading...</p>;
  }

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
