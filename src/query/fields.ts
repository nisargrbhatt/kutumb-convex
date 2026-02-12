import { getOrganizationCustomFields } from "@/api/fields";
import { queryOptions } from "@tanstack/react-query";

export const getOrganizationCustomFieldsQuery = (props: { orgSlug: string }) =>
	queryOptions({
		queryKey: ["get-organization-custom-fields", props.orgSlug],
		queryFn: async ({ signal }) =>
			await getOrganizationCustomFields({
				data: {
					organizationSlug: props.orgSlug,
				},
				signal,
			}),
	});
