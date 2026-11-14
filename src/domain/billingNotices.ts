import type { BillingNoticeKind } from "@/db/constants";
import type { orgBilling } from "@/db/schema";
import { billingAccess, type LockReason, type OrgBillingRow } from "./billing";

/** What `dueNotices` reads: the access columns plus `syncedAt` (a Lock anchor fallback). */
export type NoticeRow = OrgBillingRow & Pick<typeof orgBilling.$inferSelect, "syncedAt">;

/** One reminder email (spec: Reminders). `anchor` = ISO of the deadline it's about; dedupe key. */
export type BillingNotice = {
	kind: BillingNoticeKind;
	anchor: string;
	/** The deadline (or Lock date) the copy names. */
	deadline: Date;
	/** `locked` only. */
	lockReason?: LockReason;
};

export const noticeKey = (n: Pick<BillingNotice, "kind" | "anchor">) => `${n.kind}:${n.anchor}`;

const DAY_MS = 86_400_000;

const notice = (
	kind: BillingNoticeKind,
	deadline: Date,
	lockReason?: LockReason
): BillingNotice => ({
	kind,
	anchor: deadline.toISOString(),
	deadline,
	...(lockReason && { lockReason }),
});

/**
 * The sweep's notice due for `row` now, minus those in `sent` (`noticeKey`s). Pure. At most one:
 * only the latest window counts (missed T-3 → T-1 alone) and a passed deadline never reminds.
 * `grace_start` isn't here: the webhook sends it (`graceStartNotice`).
 */
export function dueNotices(row: NoticeRow, now: Date, sent: ReadonlySet<string>): BillingNotice[] {
	const due = latestDue(row, now);
	return due && !sent.has(noticeKey(due)) ? [due] : [];
}

function latestDue(row: NoticeRow, now: Date): BillingNotice | null {
	const access = billingAccess(row, now);
	const left = (deadline: Date) => deadline.getTime() - now.getTime();

	switch (access.state) {
		case "trialing": {
			const end = access.trialEndsAt;
			if (!access.hasPaymentMethod && left(end) <= DAY_MS) return notice("trial_t1", end);
			return left(end) <= 3 * DAY_MS ? notice("trial_t3", end) : null;
		}
		case "grace": {
			const end = access.graceEndsAt;
			return end && left(end) <= 2 * DAY_MS ? notice("grace_t2", end) : null;
		}
		case "locked": {
			const reason = access.lockReason ?? "trial_ended";
			return notice("locked", lockAnchor(row, reason), reason);
		}
		default:
			return null;
	}
}

/** Lock date per reason (spec: Reminders); `syncedAt` when Dodo gave none. */
function lockAnchor(row: NoticeRow, reason: LockReason): Date {
	switch (reason) {
		case "trial_ended":
			return row.trialEndsAt;
		case "payment_failed":
			return row.pastDueEndsAt ?? row.syncedAt;
		case "canceled":
			return row.nextBillingDate ?? row.syncedAt;
	}
}

/** The webhook's notice on entering `grace`, anchored on its end (else `syncedAt`). */
export const graceStartNotice = (
	row: Pick<NoticeRow, "pastDueEndsAt" | "syncedAt">
): BillingNotice => notice("grace_start", row.pastDueEndsAt ?? row.syncedAt);
