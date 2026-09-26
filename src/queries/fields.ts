import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	addOrganizationCustomField,
	deleteOrganizationCustomField,
	getOrganizationCustomFields,
} from "@/server/fields";
import { fieldKeys, profileKeys } from "./keys";
import { toastMutationError, useOrgId } from "./mutation";

export type CustomFieldInput = Parameters<typeof addOrganizationCustomField>[0]["data"];

export const customFieldsQuery = (orgId: string) =>
	queryOptions({
		queryKey: fieldKeys.list(orgId),
		queryFn: () => getOrganizationCustomFields(),
	});

export function useCreateCustomField() {
	const qc = useQueryClient();
	const orgId = useOrgId();
	return useMutation({
		mutationFn: (input: CustomFieldInput) => addOrganizationCustomField({ data: input }),
		onSuccess: async () => {
			toast.success("Field added successfully");
			await qc.invalidateQueries({ queryKey: fieldKeys.all(orgId) });
		},
		onError: toastMutationError("Field", "Failed to add field"),
	});
}

export function useDeleteCustomField() {
	const qc = useQueryClient();
	const orgId = useOrgId();
	return useMutation({
		mutationFn: (fieldId: string) => deleteOrganizationCustomField({ data: { fieldId } }),
		onSuccess: async () => {
			toast.success("Field deleted successfully");
			// Profile views carry field defs (member detail) and render values by def.
			await Promise.all([
				qc.invalidateQueries({ queryKey: fieldKeys.all(orgId) }),
				qc.invalidateQueries({ queryKey: profileKeys.all(orgId) }),
			]);
		},
		onError: toastMutationError("Field", "Failed to delete field"),
	});
}
