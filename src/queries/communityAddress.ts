import { queryOptions, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AddressInput } from "@/domain/profileChanges";
import {
	addAddress,
	editAddress,
	getMyCommunityAddresses,
	removeAddress,
} from "@/server/communityAddress";
import { addressKeys } from "./keys";
import { toastMutationError, useInvalidateProfileChange } from "./mutation";

export const myAddressesQuery = (orgId: string) =>
	queryOptions({
		queryKey: addressKeys.mine(orgId),
		queryFn: () => getMyCommunityAddresses(),
	});

/** Addresses of `profileId`: own linked profile, or a Userless one for owner/admin. */
export function useAddAddress(profileId: string) {
	const invalidate = useInvalidateProfileChange();
	return useMutation({
		mutationFn: (address: AddressInput) => addAddress({ data: { profileId, address } }),
		onSuccess: async () => {
			toast.success("Address added successfully");
			await invalidate();
		},
		onError: toastMutationError("Address", "Failed to add address"),
	});
}

export function useEditAddress(profileId: string) {
	const invalidate = useInvalidateProfileChange();
	return useMutation({
		mutationFn: (v: { addressId: string; expectedVersion: number; address: AddressInput }) =>
			editAddress({ data: { profileId, ...v } }),
		onSuccess: async (result) => {
			if (result.outcome === "unchanged") {
				toast.info("No changes to save");
				return;
			}
			toast.success("Address saved");
			await invalidate();
		},
		onError: toastMutationError("Address", "Failed to save address"),
	});
}

export function useRemoveAddress(profileId: string) {
	const invalidate = useInvalidateProfileChange();
	return useMutation({
		mutationFn: (addressId: string) => removeAddress({ data: { profileId, addressId } }),
		onSuccess: async () => {
			toast.success("Address deleted successfully");
			await invalidate();
		},
		onError: toastMutationError("Address", "Failed to delete address"),
	});
}
