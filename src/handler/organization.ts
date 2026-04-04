import { db } from "@/db";
import { authMiddleware } from "@/middleware/auth";
import { createServerFn } from "@tanstack/react-start";

export const checkOrgPaymentDone = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const orgId = context.session?.session?.activeOrganizationId;
		if (typeof orgId !== "string") {
			throw new Error("No active org selected");
		}

		const orgInfo = await db.query.organization.findFirst({
			where: (fields, op) => op.eq(fields.id, orgId),
			columns: {
				metadata: true,
			},
		});

		if (!orgInfo) {
			throw new Error("Invalid Org");
		}

		try {
			const parsedMetadata = JSON.parse(orgInfo?.metadata ?? "{}");
			return {
				paymentPending: !parsedMetadata?.paymentSetup,
			};
		} catch (error) {
			return {
				paymentPending: true,
			};
		}
	});
