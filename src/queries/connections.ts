import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { downgradeMyConnection, getMyConnections, revokeMyConnection } from "@/server/connections";
import { accountKeys } from "./keys";
import { toastMutationError } from "./mutation";

export const myConnectionsQuery = (userId: string) =>
	queryOptions({
		queryKey: accountKeys.connections(userId),
		queryFn: () => getMyConnections(),
	});

export function useRevokeConnection(userId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => revokeMyConnection({ data: { id } }),
		onSuccess: async () => {
			toast.success("Connection revoked");
			await qc.invalidateQueries({ queryKey: accountKeys.connections(userId) });
		},
		onError: toastMutationError("Connection", "Failed to revoke connection"),
	});
}

export function useDowngradeConnection(userId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => downgradeMyConnection({ data: { id } }),
		onSuccess: async () => {
			toast.success("Connection is now read only");
			await qc.invalidateQueries({ queryKey: accountKeys.connections(userId) });
		},
		onError: toastMutationError("Connection", "Failed to make connection read only"),
	});
}
