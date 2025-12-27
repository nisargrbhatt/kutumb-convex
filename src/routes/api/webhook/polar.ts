import { createFileRoute } from "@tanstack/react-router";
import { Webhooks } from "@polar-sh/tanstack-start";
import { env } from "cloudflare:workers";
import { createOrganization, deleteOrganization } from "@/api/organization";

export const Route = createFileRoute("/api/webhook/polar")({
	server: {
		handlers: {
			POST: Webhooks({
				webhookSecret: env.POLAR_WEBHOOK_SECRET,
				onSubscriptionCreated: async ({ data }) => {
					await createOrganization({
						customerId: data.customer.id,
						organizationName: data.customer.name ?? "",
						subscriptionId: data.id,
						userId: data.customer.metadata?.ownerUserId?.toString() ?? "",
					});
				},
				onSubscriptionCanceled: async ({ data }) => {
					await deleteOrganization({
						customerId: data.customerId,
						subscriptionId: data.id,
					});
				},
			}),
		},
	},
});
