import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import type { FC } from "react";
import AddressForm from "./AddressForm";
import AddressCard from "./AddressCard";

interface Props {}

const AddressList: FC<Props> = () => {
  const addressList = useQuery(api.address.listMyAddress);

  if (addressList === undefined) {
    return <p>Loading...</p>;
  }

  return (
    <div className="w-full flex flex-col justify-start items-start gap-2">
      <div className="flex flex-col items-start justify-start">
        <AddressForm />
      </div>
      <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2">
        {addressList?.map((address, index) => (
          <AddressCard address={address} index={index + 1} key={address._id} />
        ))}
      </div>
      {addressList && addressList?.length < 1 ? (
        <p className="w-full text-center text-sm text-muted-foreground">
          No Address Found
        </p>
      ) : null}
    </div>
  );
};

export default AddressList;
