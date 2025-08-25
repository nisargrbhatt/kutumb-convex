import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { DeleteIcon } from "lucide-react";
import Link from "next/link";

type AddressObject = (typeof api.address.listMyAddress)["_returnType"][number];

import { useState, type FC } from "react";

interface Props {
  address: AddressObject;
  index: number;
}

const AddressCard: FC<Props> = ({ address, index }) => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const deleteAddressAction = useMutation(api.address.deleteAddress);

  const onSubmit = async () => {
    setIsLoading(() => true);
    await deleteAddressAction({ addressId: address._id });
    setIsLoading(() => false);
  };

  return (
    <Card key={address._id}>
      <CardHeader>
        <CardTitle>Address {index}</CardTitle>
        <CardDescription>{address?.type}</CardDescription>
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
      <CardFooter>
        <CardAction>
          <Button
            variant="destructive"
            type="button"
            size="icon"
            onClick={onSubmit}
            disabled={isLoading}
            title="Remove address"
          >
            <DeleteIcon />
          </Button>
        </CardAction>
      </CardFooter>
    </Card>
  );
};

export default AddressCard;
