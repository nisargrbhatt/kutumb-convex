import { and, eq } from "drizzle-orm";
import { member, orgBilling, organization } from "@/db/schema";
import type { LockReason } from "../billing";
import { orgLockReason } from "../lock";
import type { Role } from "../permission";
import type { QueryDb } from "./db";

/** `orgBilling` columns `billingAccess` reads; select alongside other columns, no extra trip. */
export const orgBillingAccessColumns = {
	status: orgBilling.status,
	trialEndsAt: orgBilling.trialEndsAt,
	nextBillingDate: orgBilling.nextBillingDate,
	cancelAtNextBillingDate: orgBilling.cancelAtNextBillingDate,
	pastDueEndsAt: orgBilling.pastDueEndsAt,
	hasPaymentMethod: orgBilling.hasPaymentMethod,
	needsSubscription: orgBilling.needsSubscription,
	/** Null ⇔ no row (LEFT JOIN). */
	billingOrgId: orgBilling.organizationId,
};

type BillingCols = { [K in keyof typeof orgBillingAccessColumns]: unknown };

/** LEFT-JOINed billing columns → lock reason (no row = default-deny). */
export function lockFromJoined(row: BillingCols, now: Date): LockReason | undefined {
	const { billingOrgId, ...billing } = row;
	return orgLockReason(billingOrgId === null ? null : (billing as never), now);
}

export type OrgMembership = { role: Role; lockReason?: LockReason };

/**
 * The user's role in `organizationId` plus its Lock, in one query (member ⋈ orgBilling).
 * `null` for a non-member.
 */
export async function loadOrgMembership(
	db: QueryDb,
	organizationId: string,
	userId: string,
	now: Date
): Promise<OrgMembership | null> {
	const [row] = await db
		.select({ role: member.role, ...orgBillingAccessColumns })
		.from(member)
		.leftJoin(orgBilling, eq(orgBilling.organizationId, member.organizationId))
		.where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
		.limit(1);
	if (!row) return null;
	const lockReason = lockFromJoined(row, now);
	return { role: row.role as Role, ...(lockReason && { lockReason }) };
}

export type MemberOrg = {
	id: string;
	name: string;
	slug: string;
	role: Role;
	lockReason?: LockReason;
};

/** Every org the user belongs to, with its Lock, sorted by name. One query. */
export async function listMemberOrgs(db: QueryDb, userId: string, now: Date): Promise<MemberOrg[]> {
	const rows = await db
		.select({
			id: organization.id,
			name: organization.name,
			slug: organization.slug,
			role: member.role,
			...orgBillingAccessColumns,
		})
		.from(member)
		.innerJoin(organization, eq(organization.id, member.organizationId))
		.leftJoin(orgBilling, eq(orgBilling.organizationId, member.organizationId))
		.where(eq(member.userId, userId));
	return rows
		.map((r) => {
			const lockReason = lockFromJoined(r, now);
			return {
				id: r.id,
				name: r.name,
				slug: r.slug,
				role: r.role as Role,
				...(lockReason && { lockReason }),
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** The org's Lock reason, or `undefined` when open. For hooks that only know the org. */
export async function loadOrgLock(
	db: QueryDb,
	organizationId: string,
	now: Date
): Promise<LockReason | undefined> {
	const [row] = await db
		.select(orgBillingAccessColumns)
		.from(orgBilling)
		.where(eq(orgBilling.organizationId, organizationId))
		.limit(1);
	return orgLockReason(row ?? null, now);
}
