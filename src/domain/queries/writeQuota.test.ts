import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/domain/errors";
import { MEMBER, input, profileChangesHarness } from "@/test/profileChangesHarness";
import { assertDailyWriteQuota } from "./writeQuota";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 10 * DAY;
const KEY = { organizationId: "o1", userId: "u-member", clientId: "c1" };
const LIMITS = { daily: 3, create: 2 };

let h: ReturnType<typeof profileChangesHarness>;
let n = 0;

/** One attributed Audit Event, as `submit` through a Connection writes it. */
function event(
	over: {
		action?: string;
		payload?: unknown;
		at?: number;
		via?: string | null;
		user?: string;
		org?: string;
	} = {}
) {
	const {
		action = "profile.updated",
		payload = {},
		at = NOW - 1000,
		via = "c1",
		user = "u-member",
		org = "o1",
	} = over;
	h.fresh.sqlite
		.prepare(
			`INSERT INTO auditEvent (id, organizationId, action, createdAt, actorUserId, actorName, actorRole, profileId, profileName, payload, viaClientId)
			 VALUES (?, ?, ?, ?, ?, 'N', 'member', 'p', 'P', ?, ?)`
		)
		.run(`e${++n}`, org, action, at, user, JSON.stringify(payload), via);
}
const createEvent = (at?: number) => event({ action: "profile.created", at });
const requestedCreate = (at?: number) =>
	event({ action: "change_request.submitted", payload: { kind: "create" }, at });

const check = (create = false) =>
	assertDailyWriteQuota(h.db, KEY, { create, now: NOW, limits: LIMITS });

const quotaError = async (create = false) => {
	try {
		await check(create);
	} catch (e) {
		expect(e).toBeInstanceOf(AppError);
		expect((e as AppError).kind).toBe("LimitReached");
		return (e as AppError).message;
	}
	return null;
};

beforeEach(() => {
	h = profileChangesHarness();
	h.fresh.sqlite.exec(
		"INSERT INTO organization (id, name, slug, created_at) VALUES ('o2', 'Org 2', 'o2', 0)"
	);
});

describe("assertDailyWriteQuota", () => {
	it("passes under the daily limit", async () => {
		event();
		event();
		expect(await quotaError()).toBeNull();
	});

	it("blocks at the daily limit and says when the oldest event frees a slot", async () => {
		event({ at: NOW - DAY + 30 * 60 * 1000 }); // frees in 30 min
		event({ at: NOW - 3 * 60 * 60 * 1000 });
		event({ at: NOW - 1000 });
		expect(await quotaError()).toBe("Write quota reached, resets in ~30 min.");
	});

	it("only counts this Connection (client + member + org) inside the rolling 24h", async () => {
		event({ via: "other-client" });
		event({ via: null });
		event({ user: "u-other" });
		event({ org: "o2" });
		event({ at: NOW - DAY - 1 });
		event();
		event();
		expect(await quotaError()).toBeNull();
	});

	it("create_profile has its own sub-cap, counting applied and requested creates", async () => {
		createEvent();
		requestedCreate();
		expect(await quotaError(false)).toBeNull();
		expect(await quotaError(true)).toMatch(/^Write quota reached, resets in ~\d+ min\.$/);
	});

	it("non-create events do not eat the create sub-cap", async () => {
		event();
		event({ action: "change_request.submitted", payload: { kind: "info" } });
		expect(await quotaError(true)).toBeNull();
	});

	it("when both caps are hit, reports the later reset", async () => {
		createEvent(NOW - DAY + 10 * 60 * 1000);
		createEvent(NOW - DAY + 20 * 60 * 1000);
		event({ at: NOW - DAY + 5 * 60 * 1000 });
		expect(await quotaError(true)).toBe("Write quota reached, resets in ~10 min.");
	});

	it("counts events written by a real Connection submit", async () => {
		const asClient = h.changesVia({ clientId: "c1", clientName: "Claude" });
		await asClient.submit(MEMBER, { kind: "create", profile: input() });
		await asClient.submit(MEMBER, { kind: "create", profile: input({ firstName: "B" }) });
		await h.changes.submit(MEMBER, { kind: "create", profile: input({ firstName: "C" }) });
		const at = (await h.events())[0]!.createdAt.getTime();
		await expect(
			assertDailyWriteQuota(h.db, KEY, { create: true, now: at + 1000, limits: LIMITS })
		).rejects.toMatchObject({ kind: "LimitReached" });
	});
});
