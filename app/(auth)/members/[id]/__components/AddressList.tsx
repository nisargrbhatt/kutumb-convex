import { api } from "@/convex/_generated/api";
import type { FC } from "react";
import AddressCard from "./AddressCard";

type AddressList = NonNullable<
  (typeof api.profile.getProfileDetail)["_returnType"]
>["address"];

interface Props {
  addresses: AddressList;
}

const AddressList: FC<Props> = ({ addresses }) => {
  return (
    <div className="w-full flex flex-col justify-start items-start gap-2">
      <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2">
        {addresses?.map((address, index) => (
          <AddressCard address={address} index={index + 1} key={address._id} />
        ))}
      </div>
      {addresses && addresses?.length < 1 ? (
        <p className="w-full text-center text-sm text-muted-foreground">
          No Address Found
        </p>
      ) : null}
    </div>
  );
};

export default AddressList;
