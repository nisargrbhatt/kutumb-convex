import { createFileRoute } from "@tanstack/react-router";
import { db } from "@/db";
import { createDodo } from "@/lib/dodo";
import { captureBillingEvent } from "@/lib/posthog-server";
import { notifyGraceStart } from "@/server/billingSweep";
import { handleBillingWebhook } from "@/server/billingWebhook";

/** Dodo webhook endpoint. Outside `/api/auth`; exempt from Lock (spec: Webhook). */
export const Route = createFileRoute("/api/billing/webhook")({
	server: {
		handlers: {
			POST: ({ request }) =>
				handleBillingWebhook(request, {
					db,
					dodo: createDodo(),
					capture: captureBillingEvent,
					notifyGraceStart,
				}),
		},
	},
});
