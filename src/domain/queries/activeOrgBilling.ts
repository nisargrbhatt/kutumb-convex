import { and, asc, eq, like } from "drizzle-orm";
import { member, orgBilling, organization, user } from "@/db/schema";
import { billingAccess, type BillingAccess } from "../billing";
import { priceLabel } from "../billingCopy";
import { isOwnerRole, type Role } from "../permission";
import type { QueryDb } from "./db";

export type ActiveOrgBilling = {
	orgName: string;
	role: Role;
	isOwner: boolean;
	/** Owners' names, longest-standing first (lock screen / member banner). */
	ownerNames: string[];
	/** Owners only ("$5"); members never see prices. */
	price: string | null;
	access: BillingAccess;
};

/**
 * Billing for the user's active org, for the `_community` gate, `/locked` and the banner. `null`
 * for a non-member. No `orgBilling` row = locked `trial_ended` (default-deny).
 */
export async function loadActiveOrgBilling(
	db: QueryDb,
	organizationId: string,
	userId: string,
	now: Date
): Promise<ActiveOrgBilling | null> {
	const [[row], owners] = await Promise.all([
		db
			.select({ role: member.role, orgName: organization.name, billing: orgBilling })
			.from(member)
			.innerJoin(organization, eq(organization.id, member.organizationId))
			.leftJoin(orgBilling, eq(orgBilling.organizationId, member.organizationId))
			.where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
			.limit(1),
		db
			.select({ name: user.name, role: member.role })
			.from(member)
			.innerJoin(user, eq(user.id, member.userId))
			.where(and(eq(member.organizationId, organizationId), like(member.role, "%owner%")))
			.orderBy(asc(member.createdAt)),
	]);
	if (!row) return null;
	const isOwner = isOwnerRole(row.role);
	const access: BillingAccess = row.billing
		? billingAccess(row.billing, now)
		: {
				state: "locked",
				locked: true,
				lockReason: "trial_ended",
				hasPaymentMethod: false,
				trialEndsAt: now,
			};
	return {
		orgName: row.orgName,
		role: row.role as Role,
		isOwner,
		ownerNames: owners.filter((o) => isOwnerRole(o.role)).map((o) => o.name),
		price: isOwner ? priceLabel(row.billing?.recurringPreTaxAmount) : null,
		access,
	};
}
