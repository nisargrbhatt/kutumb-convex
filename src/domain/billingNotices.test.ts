import { describe, expect, it } from "vitest";
import { dueNotices, noticeKey, type NoticeRow } from "./billingNotices";

const DAY = 86_400_000;
const END = new Date("2026-11-29T00:00:00.000Z");
const SYNCED = new Date("2026-11-10T00:00:00.000Z");
const at = (daysBefore: number) => new Date(END.getTime() - daysBefore * DAY);

const trial = (over: Partial<NoticeRow> = {}): NoticeRow => ({
	status: "active",
	trialEndsAt: END,
	nextBillingDate: END,
	cancelAtNextBillingDate: false,
	pastDueEndsAt: null,
	hasPaymentMethod: false,
	needsSubscription: false,
	lockedAt: SYNCED,
	...over,
});

const kinds = (row: NoticeRow, now: Date, sent: string[] = []) =>
	dueNotices(row, now, new Set(sent)).map((n) => n.kind);

describe("dueNotices", () => {
	it("card-less trial: nothing before T-3, T-3 from 3 days left, T-1 from 1 day left", () => {
		expect(kinds(trial(), at(3.5))).toEqual([]);
		expect(kinds(trial(), at(3))).toEqual(["trial_t3"]);
		expect(kinds(trial(), at(2))).toEqual(["trial_t3"]);
		expect(kinds(trial(), at(1))).toEqual(["trial_t1"]);
	});

	it("card-less trial without a sub yet behaves the same", () => {
		const row = trial({ status: null, needsSubscription: true, nextBillingDate: null });
		expect(kinds(row, at(2))).toEqual(["trial_t3"]);
		expect(kinds(row, at(0.5))).toEqual(["trial_t1"]);
	});

	it("trial with card: T-3 only, never T-1", () => {
		const row = trial({ hasPaymentMethod: true });
		expect(kinds(row, at(3))).toEqual(["trial_t3"]);
		expect(kinds(row, at(0.5))).toEqual(["trial_t3"]);
		expect(
			kinds(row, at(0.5), [noticeKey({ kind: "trial_t3", anchor: END.toISOString() })])
		).toEqual([]);
	});

	it("anchors trial notices on trialEndsAt", () => {
		expect(dueNotices(trial(), at(2), new Set())).toEqual([
			{ kind: "trial_t3", anchor: END.toISOString(), deadline: END },
		]);
	});

	it("already-sent notice is not due again", () => {
		const sent = [noticeKey({ kind: "trial_t3", anchor: END.toISOString() })];
		expect(kinds(trial(), at(2), sent)).toEqual([]);
		expect(kinds(trial(), at(1), sent)).toEqual(["trial_t1"]);
	});

	it("missed windows send only the latest: T-1 alone when T-3 was never sent", () => {
		expect(kinds(trial(), at(0.2))).toEqual(["trial_t1"]);
	});

	it("passed trial deadline never reminds", () => {
		const row = trial({ needsSubscription: true, status: null });
		expect(kinds(row, new Date(END.getTime() + 1))).not.toContain("trial_t1");
	});

	describe("grace", () => {
		const GRACE_END = new Date("2026-12-10T00:00:00.000Z");
		const grace = trial({
			status: "past_due",
			hasPaymentMethod: true,
			trialEndsAt: new Date("2026-11-01T00:00:00.000Z"),
			pastDueEndsAt: GRACE_END,
		});

		it("reminds 2 days before grace end, anchored on pastDueEndsAt", () => {
			expect(kinds(grace, new Date(GRACE_END.getTime() - 3 * DAY))).toEqual([]);
			expect(dueNotices(grace, new Date(GRACE_END.getTime() - 2 * DAY), new Set())).toEqual([
				{ kind: "grace_t2", anchor: GRACE_END.toISOString(), deadline: GRACE_END },
			]);
		});

		it("never reminds once grace has ended (that's a Lock)", () => {
			expect(kinds(grace, new Date(GRACE_END.getTime() + 1))).toEqual(["locked"]);
		});

		it("grace with unknown end: no reminder", () => {
			expect(kinds({ ...grace, pastDueEndsAt: null }, new Date(GRACE_END))).toEqual([]);
		});
	});

	describe("locked", () => {
		it("trial_ended: once, anchored on trialEndsAt", () => {
			const row = trial({ needsSubscription: true, status: null });
			const now = new Date(END.getTime() + DAY);
			expect(dueNotices(row, now, new Set())).toEqual([
				{ kind: "locked", anchor: END.toISOString(), deadline: END, lockReason: "trial_ended" },
			]);
			expect(kinds(row, now, [noticeKey({ kind: "locked", anchor: END.toISOString() })])).toEqual(
				[]
			);
		});

		it("payment_failed: anchored on pastDueEndsAt, else lockedAt", () => {
			const pde = new Date("2026-12-01T00:00:00.000Z");
			const now = new Date("2026-12-05T00:00:00.000Z");
			const row = trial({ status: "on_hold", hasPaymentMethod: true, pastDueEndsAt: pde });
			expect(dueNotices(row, now, new Set())[0]).toMatchObject({
				anchor: pde.toISOString(),
				lockReason: "payment_failed",
			});
			expect(dueNotices({ ...row, pastDueEndsAt: null }, now, new Set())[0]).toMatchObject({
				anchor: SYNCED.toISOString(),
			});
		});

		it("canceled: anchored on nextBillingDate, else lockedAt", () => {
			const now = new Date("2026-12-05T00:00:00.000Z");
			const row = trial({ status: "cancelled" });
			expect(dueNotices(row, now, new Set())[0]).toMatchObject({
				anchor: END.toISOString(),
				lockReason: "canceled",
			});
			expect(dueNotices({ ...row, nextBillingDate: null }, now, new Set())[0]).toMatchObject({
				anchor: SYNCED.toISOString(),
			});
		});
	});

	it("no stable anchor yet (lockedAt unset): no locked notice", () => {
		const now = new Date("2026-12-05T00:00:00.000Z");
		const row = trial({ status: "on_hold", hasPaymentMethod: true, lockedAt: null });
		expect(kinds(row, now)).toEqual([]);
	});

	it("active / pending / canceling: nothing", () => {
		const after = new Date(END.getTime() + DAY);
		expect(
			kinds(trial({ hasPaymentMethod: true, nextBillingDate: new Date("2027-01-01") }), after)
		).toEqual([]);
		expect(kinds(trial({ status: "pending" }), at(1))).toEqual([]);
		expect(kinds(trial({ cancelAtNextBillingDate: true }), at(1))).toEqual([]);
	});
});
