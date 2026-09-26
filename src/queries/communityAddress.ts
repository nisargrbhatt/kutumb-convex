import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	addMyCommunityAddress,
	deleteMyCommunityAddress,
	getMyCommunityAddresses,
} from "@/server/communityAddress";
import { addressKeys, profileKeys } from "./keys";
import { toastMutationError, useOrgId } from "./mutation";

export type AddressInput = Parameters<typeof addMyCommunityAddress>[0]["data"];

export const myAddressesQuery = (orgId: string) =>
	queryOptions({
		queryKey: addressKeys.mine(orgId),
		queryFn: () => getMyCommunityAddresses(),
	});

/** Addresses also show on my member detail page. */
function useInvalidateAddresses() {
	const qc = useQueryClient();
	const orgId = useOrgId();
	return () =>
		Promise.all([
			qc.invalidateQueries({ queryKey: addressKeys.all(orgId) }),
			qc.invalidateQueries({ queryKey: profileKeys.all(orgId) }),
		]);
}

export function useAddMyAddress() {
	const invalidate = useInvalidateAddresses();
	return useMutation({
		mutationFn: (input: AddressInput) => addMyCommunityAddress({ data: input }),
		onSuccess: async () => {
			toast.success("Address added successfully");
			await invalidate();
		},
		onError: toastMutationError("Address", "Failed to add address"),
	});
}

export function useDeleteMyAddress() {
	const invalidate = useInvalidateAddresses();
	return useMutation({
		mutationFn: (id: string) => deleteMyCommunityAddress({ data: { id } }),
		onSuccess: async () => {
			toast.success("Address deleted successfully");
			await invalidate();
		},
		onError: toastMutationError("Address", "Failed to delete address"),
	});
}
