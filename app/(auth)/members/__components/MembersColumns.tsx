import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import DataGridColumnHeader from "@/components/ui/data-table-column-header";
import { api } from "@/convex/_generated/api";
import { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import Link from "next/link";

type MemberObject = (typeof api.profile.listMembers._returnType)[number];

export const columns: ColumnDef<MemberObject>[] = [
  {
    accessorFn: (row) =>
      [row.firstName, row?.middleName, row?.lastName].filter(Boolean).join(" "),
    id: "name",
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Name" />
    ),
    cell: ({ cell, row }) => {
      const name = cell.getValue<string>();
      return (
        <Link
          href={`/members/${row?.original?._id}`}
          className="hover:underline"
        >
          <div className="flex flex-row justify-start items-center gap-2">
            <Avatar>
              <AvatarImage src={row?.original?.picture} />
              <AvatarFallback>{name?.at(0)?.toUpperCase()}</AvatarFallback>
            </Avatar>
            {name}
          </div>
        </Link>
      );
    },
  },
  {
    accessorKey: "email",
    accessorFn: (row) => row.email ?? "-",
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Email" />
    ),
  },
  {
    accessorKey: "mobileNumber",
    accessorFn: (row) => row.mobileNumber ?? "-",
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Mobile Number" />
    ),
  },
  {
    accessorKey: "dateOfBirth",
    accessorFn: (row) =>
      row.dateOfBirth ? format(row.dateOfBirth, "PPP") : "-",
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Date of Birth" />
    ),
    enableGlobalFilter: false,
  },
  {
    accessorKey: "dateOfDeath",
    accessorFn: (row) =>
      row.dateOfDeath ? format(row.dateOfDeath, "PPP") : "-",
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Date of Death" />
    ),
    enableGlobalFilter: false,
  },
  {
    accessorKey: "bloodGroup",
    accessorFn: (row) => row.bloodGroup ?? "-",
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Blood Group" />
    ),
  },

  {
    accessorKey: "gotra",
    accessorFn: (row) => row.gotra ?? "-",
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Gotra" />
    ),
  },
  {
    accessorKey: "native",
    accessorFn: (row) => row.native ?? "-",
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Native" />
    ),
  },
  {
    accessorKey: "maternal",
    accessorFn: (row) => row.maternal ?? "-",
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Maternal" />
    ),
  },
  {
    accessorKey: "relationship",
    accessorFn: (row) => row.relationship ?? "-",
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Relationship" />
    ),
  },
];
