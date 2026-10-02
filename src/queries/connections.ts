import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getMyConnections, revokeMyConnection } from "@/server/connections";
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
