import { db } from "@/db";
import { organization as organizationTable } from "@/db/schema";
import { ORGANIZATION_STATUS } from "@/db/constants";
import { eq } from "drizzle-orm";
import { safeSync } from "./safe";

export type OrgStatus = (typeof ORGANIZATION_STATUS)[keyof typeof ORGANIZATION_STATUS];

export interface OrgMetadata {
	status?: OrgStatus;
	trialEndsAt?: number | null;
	customerId?: string;
	subscriptionId?: string;
	[key: string]: unknown;
}

export interface ResolvedOrgStatus {
	status: OrgStatus;
	trialEndsAt: number | null;
	inTrial: boolean;
	trialDaysLeft: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function parseOrgMetadata(metadata: string | null | undefined): OrgMetadata {
	const result = safeSync(() => JSON.parse(metadata ?? "{}") as OrgMetadata);
	return result.success && result.data && typeof result.data === "object" ? result.data : {};
}

/**
 * Resolves the effective billing status of an org.
 *
 * Trial is app-managed: `active` + future `trialEndsAt`. When the trial elapses
 * without payment, the effective status flips to `pending` and is persisted
 * lazily (no cron). `trialEndsAt === null` means paid (never expires).
 */
export async function resolveOrgStatus(orgId: string): Promise<ResolvedOrgStatus> {
	const org = await db.query.organization.findFirst({
		where: (fields, op) => op.eq(fields.id, orgId),
		columns: { metadata: true },
	});

	if (!org) {
		throw new Error("Organization not found");
	}

	const metadata = parseOrgMetadata(org.metadata);
	const trialEndsAt = typeof metadata.trialEndsAt === "number" ? metadata.trialEndsAt : null;
	const now = Date.now();

	// Blocked outright.
	if (metadata.status === ORGANIZATION_STATUS.pending) {
		return { status: ORGANIZATION_STATUS.pending, trialEndsAt, inTrial: false, trialDaysLeft: 0 };
	}

	// Paid (no trial expiry).
	if (trialEndsAt === null) {
		return {
			status: ORGANIZATION_STATUS.active,
			trialEndsAt: null,
			inTrial: false,
			trialDaysLeft: 0,
		};
	}

	// Trial elapsed -> lazily flip to pending.
	if (now > trialEndsAt) {
		await db
			.update(organizationTable)
			.set({ metadata: JSON.stringify({ ...metadata, status: ORGANIZATION_STATUS.pending }) })
			.where(eq(organizationTable.id, orgId));
		return { status: ORGANIZATION_STATUS.pending, trialEndsAt, inTrial: false, trialDaysLeft: 0 };
	}

	// In trial, usable.
	const trialDaysLeft = Math.ceil((trialEndsAt - now) / DAY_MS);
	return { status: ORGANIZATION_STATUS.active, trialEndsAt, inTrial: true, trialDaysLeft };
}
