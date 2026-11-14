import { createFileRoute } from "@tanstack/react-router";
import { db } from "@/db";
import { isAppError } from "@/domain/errors";
import { can } from "@/domain/permission";
import { loadOrgMembership } from "@/domain/queries/orgLock";
import { auth } from "@/lib/auth";
import { invoicePdf } from "@/lib/billing";

/**
 * Invoice PDF of one of the active org's Dodo payments. Owners only; Lock-exempt (owners of a
 * Locked org may still fetch past invoices).
 */
export const Route = createFileRoute("/api/billing/invoice/$paymentId")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const session = await auth.api.getSession({ headers: request.headers });
				if (!session) return new Response("Unauthorized", { status: 401 });
				const organizationId = session.session.activeOrganizationId;
				const m =
					typeof organizationId === "string"
						? await loadOrgMembership(db, organizationId, session.user.id, new Date())
						: null;
				if (
					!m ||
					!can(
						{ userId: session.user.id, organizationId: organizationId as string, role: m.role },
						{ billing: ["manage"] }
					)
				) {
					return new Response("Forbidden", { status: 403 });
				}
				try {
					return await invoicePdf(organizationId as string, params.paymentId);
				} catch (error) {
					if (isAppError(error) && error.kind === "NotFound") {
						return new Response("Not found", { status: 404 });
					}
					throw error;
				}
			},
		},
	},
});
