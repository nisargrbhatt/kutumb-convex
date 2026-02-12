import { getOrganizationContext } from "@/api/organization";
import { queryOptions } from "@tanstack/react-query";

export const getOrganizationContextQuery = (props: { slug: string }) =>
	queryOptions({
		queryKey: ["get-organization-context", props.slug],
		queryFn: async ({ signal }) =>
			getOrganizationContext({
				data: {
					slug: props.slug,
				},
				signal,
			}),
	});
