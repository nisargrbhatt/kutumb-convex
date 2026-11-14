import { and, eq, inArray } from "drizzle-orm";
import { member, organization, user } from "@/db/auth-schema";
import { billingNotice, orgBilling } from "@/db/app-schema";
import { ORGANIZATION_ROLES } from "@/db/constants";
import type { LockReason } from "./billing";
import { dueNotices, noticeKey, type BillingNotice } from "./billingNotices";
import { inChunks, type QueryDb } from "./queries/db";

/** What a billing email template needs (spec: Reminders). */
export type BillingEmail = {
	kind: BillingNotice["kind"];
	organizationName: string;
	deadline: Date;
	hasPaymentMethod: boolean;
	lockReason?: LockReason;
};

type NotifierDeps = {
	db: QueryDb;
	now: () => Date;
	/** One email to one owner; `false` (or throw) = not sent. */
	email: (to: string, email: BillingEmail) => Promise<boolean>;
	capture: (event: "billing_locked", p: { organizationId: string; userId: string }) => void;
};

type NoticeTarget = {
	organizationId: string;
	createdByUserId: string;
	hasPaymentMethod: boolean;
};

/**
 * Sends one notice to all owners at send time (spec: Reminders). Insert-or-ignore `billingNotice`
 * first, send only if inserted; any send failure deletes the row so the next sweep retries.
 */
export function makeBillingNotifier({ db, now, email, capture }: NotifierDeps) {
	return {
		async deliver(
			row: NoticeTarget,
			notice: BillingNotice
		): Promise<"sent" | "skipped" | "failed"> {
			const { organizationId } = row;
			const inserted = await db
				.insert(billingNotice)
				.values({ organizationId, kind: notice.kind, anchor: notice.anchor, sentAt: now() })
				.onConflictDoNothing()
				.returning({ kind: billingNotice.kind });
			if (inserted.length === 0) return "skipped";

			let ok = false;
			try {
				const owners = await db
					.select({ email: user.email, organizationName: organization.name })
					.from(member)
					.innerJoin(user, eq(user.id, member.userId))
					.innerJoin(organization, eq(organization.id, member.organizationId))
					.where(
						and(
							eq(member.organizationId, organizationId),
							eq(member.role, ORGANIZATION_ROLES.owner)
						)
					);
				const content: BillingEmail = {
					kind: notice.kind,
					organizationName: owners[0]?.organizationName ?? "",
					deadline: notice.deadline,
					hasPaymentMethod: row.hasPaymentMethod,
					...(notice.lockReason && { lockReason: notice.lockReason }),
				};
				const results = await Promise.all(
					owners.map((o) => email(o.email, content).catch(() => false))
				);
				ok = results.every(Boolean);
			} catch (error) {
				console.error("billing notice failed", notice.kind, organizationId, error);
			}
			if (!ok) {
				await db
					.delete(billingNotice)
					.where(
						and(
							eq(billingNotice.organizationId, organizationId),
							eq(billingNotice.kind, notice.kind),
							eq(billingNotice.anchor, notice.anchor)
						)
					);
				return "failed";
			}
			if (notice.kind === "locked") {
				capture("billing_locked", { organizationId, userId: row.createdByUserId });
			}
			return "sent";
		},
	};
}

type SweepDeps = NotifierDeps & {
	/** Retry sub creation for a `needsSubscription` org (tickets 06/15). */
	ensureSubscription: (organizationId: string) => Promise<unknown>;
};

/**
 * Hourly billing sweep (spec: Reminders): retry `ensureSubscription` for `needsSubscription` rows,
 * then send each org's due notice. Lock itself stays lazy. Per-org failures are logged and left to
 * the next run. Never throws.
 */
export function makeBillingSweep(deps: SweepDeps) {
	const notifier = makeBillingNotifier(deps);
	const { db } = deps;
	return {
		async run() {
			const result = { ensured: 0, sent: 0, failed: 0 };
			try {
				const now = deps.now();
				const rows = await db.select().from(orgBilling);

				for (const row of rows.filter((r) => r.needsSubscription)) {
					try {
						await deps.ensureSubscription(row.organizationId);
						result.ensured++;
					} catch (error) {
						console.error("ensureSubscription retry failed", row.organizationId, error);
					}
				}

				const candidates = rows.filter((r) => dueNotices(r, now, new Set()).length > 0);
				const sentRows = await inChunks(
					candidates.map((r) => r.organizationId),
					(ids) =>
						db
							.select({
								organizationId: billingNotice.organizationId,
								kind: billingNotice.kind,
								anchor: billingNotice.anchor,
							})
							.from(billingNotice)
							.where(inArray(billingNotice.organizationId, ids))
				);
				const sentByOrg = new Map<string, Set<string>>();
				for (const s of sentRows) {
					const set = sentByOrg.get(s.organizationId) ?? new Set<string>();
					set.add(noticeKey(s));
					sentByOrg.set(s.organizationId, set);
				}

				for (const row of candidates) {
					const sent = sentByOrg.get(row.organizationId) ?? new Set<string>();
					for (const n of dueNotices(row, now, sent)) {
						try {
							const outcome = await notifier.deliver(row, n);
							if (outcome === "sent") result.sent++;
							if (outcome === "failed") result.failed++;
						} catch (error) {
							result.failed++;
							console.error("billing notice failed", n.kind, row.organizationId, error);
						}
					}
				}
			} catch (error) {
				console.error("Billing sweep stopped; the rest waits for the next run", error);
			}
			return result;
		},
	};
}
