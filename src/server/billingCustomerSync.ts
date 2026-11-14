import { APIError } from "better-auth/api";
import { asc, eq } from "drizzle-orm";
import type DodoPayments from "dodopayments";
import { db as defaultDb } from "@/db";
import { member, orgBilling } from "@/db/schema";
import { isTerminalStatus } from "@/domain/billingEvents";
import { isOwnerRole } from "@/domain/permission";
import type { QueryDb } from "@/domain/queries/db";
import { createDodo } from "@/lib/dodo";
import { safeAsync } from "@/lib/safe";

/** Org changes → Dodo customer (spec: Org changes → Dodo customer). */
export type CustomerSyncDeps = {
	db: QueryDb;
	dodo: Pick<DodoPayments, "customers" | "subscriptions">;
};

const withDefaults = (deps: Partial<CustomerSyncDeps>): CustomerSyncDeps => ({
	db: deps.db ?? defaultDb,
	dodo: deps.dodo ?? createDodo(),
});

const billingRow = (db: QueryDb, organizationId: string) =>
	db.query.orgBilling.findFirst({ where: eq(orgBilling.organizationId, organizationId) });

/** Best-effort: never throws; failure is logged and the user's action stands. */
async function bestEffort(label: string, organizationId: string, work: () => Promise<unknown>) {
	const result = await safeAsync(work());
	if (!result.success) console.error(label, organizationId, result.error);
}

/** Org renamed → customer `name`. */
export const syncCustomerName = (
	organizationId: string,
	name: string,
	deps: Partial<CustomerSyncDeps> = {}
) =>
	bestEffort("syncCustomerName failed", organizationId, async () => {
		const { db, dodo } = withDefaults(deps);
		const row = await billingRow(db, organizationId);
		if (!row?.dodoCustomerId) return;
		await dodo.customers.update(row.dodoCustomerId, { name });
	});

const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * A user stopped being an owner (leave, removal, demotion). If the customer's email is theirs, switch
 * it to the longest-standing remaining owner (`member.createdAt`). No owner left → unchanged.
 */
export const syncBillingEmail = (
	organizationId: string,
	formerOwnerEmail: string,
	deps: Partial<CustomerSyncDeps> = {}
) =>
	bestEffort("syncBillingEmail failed", organizationId, async () => {
		const { db, dodo } = withDefaults(deps);
		const row = await billingRow(db, organizationId);
		if (!row?.dodoCustomerId) return;
		const customer = await dodo.customers.retrieve(row.dodoCustomerId);
		if (!sameEmail(customer.email, formerOwnerEmail)) return;
		const members = await db.query.member.findMany({
			where: eq(member.organizationId, organizationId),
			orderBy: asc(member.createdAt),
			with: { user: { columns: { email: true } } },
		});
		const next = members.find(
			(m) => isOwnerRole(m.role) && !sameEmail(m.user.email, formerOwnerEmail)
		);
		if (!next) return;
		await dodo.customers.update(row.dodoCustomerId, { email: next.user.email });
	});

export const CANCEL_FOR_DELETE_FAILED = "Couldn't cancel the subscription, try again";

/**
 * Before org delete: a live sub is cancelled now (no refund). No sub / terminal → skip. Dodo error
 * throws so the delete is refused. Customer stays (no delete API); the row cascades with the org.
 */
export async function cancelSubscriptionForDelete(
	organizationId: string,
	deps: Partial<CustomerSyncDeps> = {}
) {
	const { db, dodo } = withDefaults(deps);
	const row = await billingRow(db, organizationId);
	if (!row?.subscriptionId || isTerminalStatus(row.status)) return;
	const result = await safeAsync(
		dodo.subscriptions.update(row.subscriptionId, { status: "cancelled" })
	);
	if (!result.success) {
		console.error("cancelSubscriptionForDelete failed", organizationId, result.error);
		throw new APIError("SERVICE_UNAVAILABLE", { message: CANCEL_FOR_DELETE_FAILED });
	}
}
