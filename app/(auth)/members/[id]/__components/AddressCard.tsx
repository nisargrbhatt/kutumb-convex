import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { FC } from "react";

type AddressObject = NonNullable<
  (typeof api.profile.getProfileDetail)["_returnType"]
>["address"][number];

interface Props {
  address: AddressObject;
  index: number;
}

const AddressCard: FC<Props> = ({ address, index }) => {
  return (
    <Card key={address._id}>
      <CardHeader>
        <CardTitle>Address {index}</CardTitle>
        <CardDescription className="capitalize">
          {address?.type}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>Line1</TableCell>
              <TableCell>{address?.line1}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Line2</TableCell>
              <TableCell>{address?.line2}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Country</TableCell>
              <TableCell>{address?.country}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>State</TableCell>
              <TableCell>{address?.state}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>City</TableCell>
              <TableCell>{address?.city}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Postal Code</TableCell>
              <TableCell>{address?.postalCode}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Note</TableCell>
              <TableCell>{address?.note ?? "-"}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Digipin</TableCell>
              <TableCell>
                {address?.digipin ? (
                  <Link
                    className="hover:underline"
                    target="_blank"
                    href={`https://dac.indiapost.gov.in/mydigipin/home/${address?.digipin}`}
                  >
                    {address?.digipin}
                  </Link>
                ) : (
                  "-"
                )}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default AddressCard;
