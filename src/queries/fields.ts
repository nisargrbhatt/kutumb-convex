import { queryOptions } from "@tanstack/react-query";
import { getOrganizationCustomFields } from "@/server/fields";

export const getOrganizationCustomFieldsQuery = () =>
	queryOptions({
		queryKey: ["get-organization-custom-fields"],
		queryFn: () => getOrganizationCustomFields(),
	});
