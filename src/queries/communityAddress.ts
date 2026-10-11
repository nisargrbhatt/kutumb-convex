import { queryOptions, useMutation } from "@tanstack/react-query";
import type { AddressInput } from "@/domain/profileChanges";
import {
	addAddress,
	editAddress,
	getMyCommunityAddresses,
	removeAddress,
} from "@/server/communityAddress";
import { addressKeys } from "./keys";
import { toastSubmitError, useInvalidateProfileChange, useNotifySubmit } from "./mutation";

export const myAddressesQuery = (orgId: string) =>
	queryOptions({
		queryKey: addressKeys.mine(orgId),
		queryFn: () => getMyCommunityAddresses(),
	});

/**
 * Addresses of `profileId`: own linked profile, or a Userless one (owner/admin + own draft apply
 * directly; a plain member on an active one sends a Change Request).
 */
export function useAddAddress(profileId: string) {
	const invalidate = useInvalidateProfileChange();
	const notify = useNotifySubmit();
	return useMutation({
		mutationFn: (address: AddressInput) => addAddress({ data: { profileId, address } }),
		onSuccess: async (result) => {
			if (notify(result.outcome, "address_add", "Address added successfully")) await invalidate();
		},
		onError: toastSubmitError("Address", "Failed to add address"),
	});
}

export function useEditAddress(profileId: string) {
	const invalidate = useInvalidateProfileChange();
	const notify = useNotifySubmit();
	return useMutation({
		mutationFn: (v: { addressId: string; expectedVersion: number; address: AddressInput }) =>
			editAddress({ data: { profileId, ...v } }),
		onSuccess: async (result) => {
			if (notify(result.outcome, "address_edit", "Address saved")) await invalidate();
		},
		onError: toastSubmitError("Address", "Failed to save address"),
	});
}

export function useRemoveAddress(profileId: string) {
	const invalidate = useInvalidateProfileChange();
	const notify = useNotifySubmit();
	return useMutation({
		mutationFn: (addressId: string) => removeAddress({ data: { profileId, addressId } }),
		onSuccess: async (result) => {
			if (notify(result.outcome, "address_remove", "Address deleted successfully"))
				await invalidate();
		},
		onError: toastSubmitError("Address", "Failed to delete address"),
	});
}
