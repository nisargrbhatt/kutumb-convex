import { and, eq, like } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { member, organization, user } from "@/db/schema";
import { billingAccess } from "@/domain/billing";
import { type Banner, bannerFor } from "@/domain/billingBanner";
import { priceLabel } from "@/domain/billingCopy";
import type { QueryDb } from "@/domain/queries/db";
import { billingRow } from "@/lib/billing";

const isOwnerRole = (role: string) => role.split(",").some((r) => r.trim() === "owner");

async function ownerNames(db: QueryDb, organizationId: string) {
	const rows = await db
		.select({ name: user.name, role: member.role })
		.from(member)
		.innerJoin(user, eq(user.id, member.userId))
		.where(and(eq(member.organizationId, organizationId), like(member.role, "%owner%")));
	return rows.filter((r) => isOwnerRole(r.role)).map((r) => r.name);
}

/**
 * Banner for the active org, as copy only: price is filled for owners alone; org + owner names are
 * loaded only when a member heads-up shows.
 */
export async function loadBanner(
	organizationId: string,
	role: string,
	{ db = defaultDb, now = new Date() }: { db?: QueryDb; now?: Date } = {}
): Promise<Banner | null> {
	const row = await billingRow(db, organizationId);
	if (!row) return null;
	const access = billingAccess(row, now);
	if (isOwnerRole(role)) {
		return bannerFor(access, role, {
			orgName: "",
			price: priceLabel(row.recurringPreTaxAmount),
			ownerNames: [],
		});
	}
	if (!bannerFor(access, role, { orgName: "", price: "", ownerNames: [] })) return null;
	const [org, names] = await Promise.all([
		db.query.organization.findFirst({ where: eq(organization.id, organizationId) }),
		ownerNames(db, organizationId),
	]);
	return bannerFor(access, role, { orgName: org?.name ?? "", price: "", ownerNames: names });
}
