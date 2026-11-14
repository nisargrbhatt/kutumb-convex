import { beforeEach, describe, expect, it } from "vitest";
import { freshDb } from "@/test/sqliteDb";
import { graceStartNotice } from "./billingNotices";
import { makeBillingNotifier, makeBillingSweep, type BillingEmail } from "./billingSweep";

const DAY = 86_400_000;
const TRIAL_END = Date.parse("2026-11-29T00:00:00.000Z");

describe("billing sweep", () => {
	let sqlite: ReturnType<typeof freshDb>["sqlite"];
	let db: ReturnType<typeof freshDb>["db"];
	let now: Date;
	let sent: { to: string; email: BillingEmail }[];
	let failFor: Set<string>;
	let captured: { event: string; organizationId: string; userId: string }[];
	let ensured: string[];

	const deps = () => ({
		db,
		now: () => now,
		email: async (to: string, email: BillingEmail) => {
			if (failFor.has(to)) return false;
			sent.push({ to, email });
			return true;
		},
		capture: (event: "billing_locked", p: { organizationId: string; userId: string }) => {
			captured.push({ event, ...p });
		},
		ensureSubscription: async (organizationId: string) => {
			ensured.push(organizationId);
		},
	});
	const sweep = () => makeBillingSweep(deps()).run();

	/** Org `id` with a card-less trial ending at TRIAL_END, owners `owners`, plus one admin. */
	function seedOrg(id: string, owners: string[], billing = "needsSubscription = 1") {
		sqlite.exec(
			`INSERT INTO organization (id, name, slug, created_at) VALUES ('${id}', 'Org ${id}', '${id}', 0);`
		);
		for (const [i, u] of [...owners, `${id}-admin`].entries()) {
			sqlite.exec(`
				INSERT OR IGNORE INTO user (id, name, email) VALUES ('${u}', '${u}', '${u}@x.test');
				INSERT INTO member (id, organization_id, user_id, role, created_at)
					VALUES ('${id}-m${i}', '${id}', '${u}', '${i < owners.length ? "owner" : "admin"}', 0);
			`);
		}
		sqlite.exec(`
			INSERT INTO orgBilling (organizationId, createdByUserId, country, trialEndsAt, syncedAt)
				VALUES ('${id}', '${owners[0]}', 'IN', ${TRIAL_END}, 0);
			UPDATE orgBilling SET ${billing} WHERE organizationId = '${id}';
		`);
	}

	beforeEach(() => {
		({ sqlite, db } = freshDb());
		now = new Date(TRIAL_END - 2 * DAY);
		sent = [];
		failFor = new Set();
		captured = [];
		ensured = [];
	});

	it("emails every owner (not admins) once per notice", async () => {
		seedOrg("o1", ["u1", "u2"]);
		await sweep();
		expect(sent.map((s) => s.to).sort()).toEqual(["u1@x.test", "u2@x.test"]);
		expect(sent[0]!.email).toMatchObject({
			kind: "trial_t3",
			organizationName: "Org o1",
			hasPaymentMethod: false,
			deadline: new Date(TRIAL_END),
		});

		now = new Date(now.getTime() + 3_600_000);
		await sweep();
		expect(sent).toHaveLength(2);
	});

	it("next window's notice still goes after an earlier one", async () => {
		seedOrg("o1", ["u1"]);
		await sweep();
		now = new Date(TRIAL_END - DAY / 2);
		await sweep();
		expect(sent.map((s) => s.email.kind)).toEqual(["trial_t3", "trial_t1"]);
	});

	it("send failure is retried next hour", async () => {
		seedOrg("o1", ["u1"]);
		failFor.add("u1@x.test");
		await sweep();
		expect(sent).toEqual([]);
		failFor.clear();
		await sweep();
		expect(sent.map((s) => s.email.kind)).toEqual(["trial_t3"]);
	});

	it("one org's failure doesn't stop others", async () => {
		seedOrg("o1", ["u1"]);
		seedOrg("o2", ["u2"]);
		failFor.add("u1@x.test");
		await sweep();
		expect(sent.map((s) => s.to)).toEqual(["u2@x.test"]);
	});

	it("locked notice fires billing_locked once", async () => {
		seedOrg("o1", ["u1"]);
		now = new Date(TRIAL_END + DAY);
		await sweep();
		await sweep();
		expect(sent.map((s) => s.email)).toEqual([
			expect.objectContaining({ kind: "locked", lockReason: "trial_ended" }),
		]);
		expect(captured).toEqual([{ event: "billing_locked", organizationId: "o1", userId: "u1" }]);
	});

	it("payment_failed lock without a Dodo date: locked email once, though syncedAt moves", async () => {
		seedOrg(
			"o1",
			["u1"],
			"needsSubscription = 0, status = 'on_hold', hasPaymentMethod = 1, subscriptionId = 'sub_1'"
		);
		now = new Date(TRIAL_END + DAY);
		await sweep();
		sqlite.exec(`UPDATE orgBilling SET syncedAt = ${now.getTime()}`);
		now = new Date(now.getTime() + 3_600_000);
		await sweep();
		expect(sent.map((s) => s.email)).toEqual([
			expect.objectContaining({ kind: "locked", lockReason: "payment_failed" }),
		]);
	});

	it('multi-role owner ("admin,owner") gets the email', async () => {
		seedOrg("o1", ["u1"]);
		sqlite.exec("UPDATE member SET role = 'admin,owner' WHERE user_id = 'u1'");
		await sweep();
		expect(sent.map((s) => s.to)).toEqual(["u1@x.test"]);
	});

	it("no owner to email: notice not marked sent, retried once an owner exists", async () => {
		seedOrg("o1", ["u1"]);
		sqlite.exec("UPDATE member SET role = 'admin' WHERE user_id = 'u1'");
		expect(await sweep()).toMatchObject({ sent: 0, failed: 1 });
		sqlite.exec("UPDATE member SET role = 'owner' WHERE user_id = 'u1'");
		await sweep();
		expect(sent.map((s) => s.to)).toEqual(["u1@x.test"]);
	});

	it("retries ensureSubscription for needsSubscription rows only", async () => {
		seedOrg("o1", ["u1"]);
		seedOrg("o2", ["u2"], "needsSubscription = 0, status = 'active', subscriptionId = 'sub_2'");
		await sweep();
		expect(ensured).toEqual(["o1"]);
	});

	it("ensureSubscription failure doesn't block reminders", async () => {
		seedOrg("o1", ["u1"]);
		await makeBillingSweep({
			...deps(),
			ensureSubscription: async () => {
				throw new Error("dodo down");
			},
		}).run();
		expect(sent).toHaveLength(1);
	});

	it("notifier sends grace_start once per grace", async () => {
		seedOrg(
			"o1",
			["u1"],
			`needsSubscription = 0, status = 'past_due', hasPaymentMethod = 1, pastDueEndsAt = ${TRIAL_END}`
		);
		const notifier = makeBillingNotifier(deps());
		const row = {
			organizationId: "o1",
			createdByUserId: "u1",
			hasPaymentMethod: true,
			pastDueEndsAt: new Date(TRIAL_END),
			syncedAt: new Date(0),
		};
		expect(await notifier.deliver(row, graceStartNotice(row))).toBe("sent");
		expect(await notifier.deliver(row, graceStartNotice(row))).toBe("skipped");
		expect(sent.map((s) => s.email.kind)).toEqual(["grace_start"]);
	});
});
