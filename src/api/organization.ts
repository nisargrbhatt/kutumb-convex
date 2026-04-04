import { authMiddleware } from "@/middleware/auth";
import { createServerFn } from "@tanstack/react-start";
import { db } from "@/db";
import { queryOptions } from "@tanstack/react-query";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "@/lib/auth";

export const checkCurrentOrgPaymentSetup = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const currentOrgId = context.session?.session?.activeOrganizationId;
		if (typeof currentOrgId !== "string") {
			throw new Error("No current Organization found");
		}

		const currentOrg = await db.query.organization.findFirst({
			where: (fields, op) => op.eq(fields.id, currentOrgId),
			columns: {
				metadata: true,
			},
		});

		if (!currentOrg) {
			throw new Error("Organization not found");
		}

		try {
			const metadata = JSON.parse(currentOrg?.metadata ?? "{}");
			const paymentSetup = metadata?.paymentSetup;
			return { paymentSetup: Boolean(paymentSetup) };
		} catch (error) {
			console.error(error, "Error parsing metadata");
			return { paymentSetup: false };
		}
	});

export const checkCurrentOrgPaymentSetupQuery = () =>
	queryOptions({
		queryKey: ["check-current-org-payment-setup"],
		queryFn: async ({ signal }) =>
			checkCurrentOrgPaymentSetup({
				signal,
			}),
		refetchInterval: (query) => {
			const paymentSetup = query?.state?.data?.paymentSetup;
			if (paymentSetup) {
				return false;
			}
			return 5 * 1000;
		},
	});

export const listMyOrganizationInvitations = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async () => {
		const invites = await auth.api.listUserInvitations({
			headers: getRequestHeaders(),
		});
		return invites;
	});
