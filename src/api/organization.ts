import { authMiddleware } from "@/middleware/auth";
import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "@/lib/auth";
import { resolveBillingStatus, type BillingStatus } from "@/lib/billing-status";
import { BILLING_STATUS } from "@/db/constants";

export const getBillingStatus = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }): Promise<BillingStatus> => {
		const currentOrgId = context.session?.session?.activeOrganizationId;
		if (typeof currentOrgId !== "string") {
			throw new Error("No current Organization found");
		}

		return resolveBillingStatus(currentOrgId);
	});

export const billingStatusQuery = () =>
	queryOptions({
		queryKey: ["billing-status"],
		queryFn: async ({ signal }) => getBillingStatus({ signal }),
		refetchInterval: (query) => (query?.state?.data === BILLING_STATUS.active ? false : 5 * 1000),
	});

export const listMyOrganizationInvitations = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async () => {
		const invites = await auth.api.listUserInvitations({
			headers: getRequestHeaders(),
		});
		return invites;
	});
