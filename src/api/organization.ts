import { authMiddleware } from "@/middleware/auth";
import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { polar } from "@/lib/polar";
import { db } from "@/db";
import { queryOptions } from "@tanstack/react-query";

const createOrganizationOwnerRecord = createServerOnlyFn(
	async (props: {
		profileId: PrimaryKey<"profile">;
		organizationId: PrimaryKey<"organization">;
		customerId: string;
	}) => {
		const createdOrgMember = await db
			.insert(organizationMember)
			.values({
				id: generatePrimaryKey("organizationMember"),
				organizationId: props.organizationId,
				memberId: props.profileId,
				role: "owner",
			})
			.returning({
				id: organizationMember.id,
			});

		const createdOrgMemberId = createdOrgMember?.at(0)?.id;

		if (!createdOrgMemberId) {
			throw new Error("Failed to create organization member");
		}

		await polar.events.ingest({
			events: [
				{
					customerId: props.customerId,
					name: "user_added",
					metadata: {
						organizationMemberId: createdOrgMemberId,
					},
				},
			],
		});
	}
);

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
