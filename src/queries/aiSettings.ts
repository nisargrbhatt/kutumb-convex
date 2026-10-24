import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getAiSettings, setAiClientWritesFn } from "@/server/orgSettings";
import { orgKeys } from "./keys";
import { toastMutationError, useOrgId } from "./mutation";

export const aiSettingsQuery = (orgId: string) =>
	queryOptions({
		queryKey: orgKeys.aiSettings(orgId),
		queryFn: () => getAiSettings(),
	});

export function useSetAiClientWrites() {
	const qc = useQueryClient();
	const orgId = useOrgId();
	return useMutation({
		mutationFn: (enabled: boolean) => setAiClientWritesFn({ data: { enabled } }),
		onSuccess: async ({ aiClientWrites }) => {
			toast.success(aiClientWrites ? "AI Clients can make changes" : "AI Clients are read only");
			await qc.invalidateQueries({ queryKey: orgKeys.aiSettings(orgId) });
		},
		onError: toastMutationError("AI settings", "Failed to update AI settings"),
	});
}
