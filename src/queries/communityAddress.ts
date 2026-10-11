import { queryOptions } from "@tanstack/react-query";
import type { AddressInput } from "@/domain/profileChanges";
import {
	addAddress,
	editAddress,
	getMyCommunityAddresses,
	removeAddress,
} from "@/server/communityAddress";
import { addressKeys } from "./keys";
import { useSubmitMutation } from "./mutation";

export const myAddressesQuery = (orgId: string) =>
	queryOptions({
		queryKey: addressKeys.mine(orgId),
		queryFn: () => getMyCommunityAddresses(),
	});

/**
 * Addresses of `profileId`: own linked profile, or a Userless one (owner/admin + own draft apply
 * directly; a plain member on an active one sends a Change Request).
 */
export const useAddAddress = (profileId: string) =>
	useSubmitMutation({
		mutationFn: (address: AddressInput) => addAddress({ data: { profileId, address } }),
		kind: "address_add",
		appliedTitle: "Address added successfully",
		error: { title: "Address", fallback: "Failed to add address" },
	});

export const useEditAddress = (profileId: string) =>
	useSubmitMutation({
		mutationFn: (v: { addressId: string; expectedVersion: number; address: AddressInput }) =>
			editAddress({ data: { profileId, ...v } }),
		kind: "address_edit",
		appliedTitle: "Address saved",
		error: { title: "Address", fallback: "Failed to save address" },
	});

export const useRemoveAddress = (profileId: string) =>
	useSubmitMutation({
		mutationFn: (addressId: string) => removeAddress({ data: { profileId, addressId } }),
		kind: "address_remove",
		appliedTitle: "Address deleted successfully",
		error: { title: "Address", fallback: "Failed to delete address" },
	});
