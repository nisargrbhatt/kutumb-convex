import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeLimits } from "@/domain/limits";
import { memberPendingBytes } from "@/domain/queries/blobs";
import { fakeR2 } from "@/test/fakeR2";
import { jpeg } from "@/test/jpegFixture";
import { materialize, movie, udtaLocation, type MovieOptions } from "@/test/mp4Fixture";
import { MEMBER, OTHER, profileChangesHarness } from "@/test/profileChangesHarness";
import { IMAGE_VARIANT_MAX_BYTES } from "./limits";
import { makeBlobRoute } from "./blobRoute";
import { makeBlobStore } from "./blobStore";

const ORIGIN = "https://k.test";

function setup() {
	const h = profileChangesHarness();
	h.fresh.sqlite.exec(`
		INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES
			('u-outsider', 'Out Sider', 'out@x.test', 1, 0, 0);
		INSERT INTO organization (id, name, slug, created_at) VALUES ('o2', 'Org 2', 'o2', 0);
		INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES
			('m9', 'o2', 'u-outsider', 'member', 0),
			('m10', 'o2', 'u-member', 'member', 0);
		INSERT INTO orgBilling (organizationId, createdByUserId, country, trialEndsAt, syncedAt) VALUES
			('o2', 'u-outsider', 'IN', 99999999999999, 0);
	`);
	const r2 = fakeR2();
	let n = 0;
	const clock = { t: 1_700_000_000_000 };
	const now = () => new Date(clock.t);
	const store = makeBlobStore({
		db: h.db,
		bucket: r2.bucket,
		limits: makeLimits(
			{
				userMemberships: async () => 0,
				orgMembersAndPending: async () => 0,
				orgProfiles: async () => 0,
				memberPendingBytes: (o, u, s) => memberPendingBytes(h.db, o, u, s),
			},
			vi.fn()
		),
		now,
		newId: () => `b${++n}`,
	});
	const getUserId = vi.fn(async (req: Request) => req.headers.get("x-test-user"));
	const route = makeBlobRoute({
		db: h.db,
		bucket: r2.bucket,
		getUserId,
		// The test "session cookie" is the user header itself.
		sessionToken: (req) => req.headers.get("x-test-user"),
		now,
	});
	/** Counting fake over the sqlite behind D1: every statement prepared. */
	const queries = { n: 0 };
	const prepare = h.fresh.sqlite.prepare.bind(h.fresh.sqlite);
	h.fresh.sqlite.prepare = ((sql: string) => {
		queries.n++;
		return prepare(sql);
	}) as typeof h.fresh.sqlite.prepare;
	return { h, r2, store, route, clock, getUserId, queries };
}

type Put = {
	user?: string | null;
	origin?: string | null;
	body?: Uint8Array<ArrayBuffer>;
	length?: string | null;
	sha256?: string;
};

const put = (
	s: ReturnType<typeof setup>,
	path: string,
	{
		user = MEMBER.userId,
		origin = ORIGIN,
		body = jpeg({ extra: [], width: 128, height: 128 }),
		length,
		sha256,
	}: Put = {}
) => {
	const headers = new Headers();
	if (user) headers.set("x-test-user", user);
	if (origin) headers.set("origin", origin);
	if (length !== null) headers.set("content-length", length ?? String(body.length));
	if (sha256) headers.set("x-blob-sha256", sha256);
	return s.route.fetch(new Request(`${ORIGIN}${path}`, { method: "PUT", headers, body }));
};

const get = (s: ReturnType<typeof setup>, path: string, user: string | null, headers = {}) =>
	s.route.fetch(
		new Request(`${ORIGIN}${path}`, {
			headers: { ...(user ? { "x-test-user": user } : {}), ...headers },
		})
	);

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const row = (s: ReturnType<typeof setup>, id: string) =>
	s.h.db.query.mediaBlob.findFirst({ where: (f, o) => o.eq(f.id, id) });

describe("PUT /api/blob/<org>/<blob>/<variant>", () => {
	let s: ReturnType<typeof setup>;
	let blobId: string;
	beforeEach(async () => {
		s = setup();
		blobId = (await s.store.start(MEMBER, { mediaKind: "profilePhoto", size: 1_000_000 })).blobId;
	});

	it("lands a verified variant and records its real size", async () => {
		const body = jpeg({ extra: [], width: 128, height: 96 });
		const res = await put(s, `/api/blob/o1/${blobId}/avatar`, { body });
		expect(res.status).toBe(200);
		expect(s.r2.objects.get(`o1/${blobId}/avatar`)?.bytes.length).toBe(body.length);
		expect((await row(s, blobId))?.variants).toEqual({ avatar: body.length });
	});

	it("records display's size, dimensions and sha256 for a profilePhoto", async () => {
		const body = jpeg({ extra: [], width: 1000, height: 800 });
		const res = await put(s, `/api/blob/o1/${blobId}/display`, { body, sha256: sha(body) });
		expect(res.status).toBe(200);
		expect(await row(s, blobId)).toMatchObject({
			variants: { display: body.length },
			width: 1000,
			height: 800,
			sha256: sha(body),
		});
	});

	it("locked org → 403, nothing lands", async () => {
		s.h.fresh.sqlite.exec("UPDATE orgBilling SET trialEndsAt = 0 WHERE organizationId = 'o1'");
		const res = await put(s, `/api/blob/o1/${blobId}/display`);
		expect(res.status).toBe(403);
		expect(await s.r2.bucket.get(`o1/${blobId}/display`)).toBeNull();
	});

	it("rejects a wrong Origin", async () => {
		expect(
			(await put(s, `/api/blob/o1/${blobId}/avatar`, { origin: "https://evil.test" })).status
		).toBe(403);
		expect((await put(s, `/api/blob/o1/${blobId}/avatar`, { origin: null })).status).toBe(403);
	});

	it("rejects another user's row", async () => {
		expect((await put(s, `/api/blob/o1/${blobId}/avatar`, { user: OTHER.userId })).status).toBe(
			404
		);
		expect(s.r2.objects.size).toBe(0);
	});

	it("rejects a row that isn't pending", async () => {
		s.h.fresh.sqlite.exec(`UPDATE blob SET status = 'attached' WHERE id = '${blobId}'`);
		expect((await put(s, `/api/blob/o1/${blobId}/avatar`)).status).toBe(409);
		expect(s.r2.objects.size).toBe(0);
	});

	it("rejects a variant the mediaKind doesn't have", async () => {
		expect((await put(s, `/api/blob/o1/${blobId}/thumb`)).status).toBe(400);
		expect((await put(s, `/api/blob/o1/${blobId}/original`)).status).toBe(404);
	});

	it("rejects a missing Content-Length", async () => {
		expect((await put(s, `/api/blob/o1/${blobId}/avatar`, { length: null })).status).toBe(411);
	});

	it("rejects over 5 MiB", async () => {
		const res = await put(s, `/api/blob/o1/${blobId}/avatar`, {
			length: String(IMAGE_VARIANT_MAX_BYTES + 1),
		});
		expect(res.status).toBe(413);
		expect(s.r2.objects.size).toBe(0);
	});

	it("rejects over the declared size", async () => {
		const small = (await s.store.start(MEMBER, { mediaKind: "profilePhoto", size: 100 })).blobId;
		expect((await put(s, `/api/blob/o1/${small}/avatar`)).status).toBe(413);
		expect(s.r2.objects.size).toBe(0);
	});

	it("needs sha256 for profilePhoto display; a wrong one leaves nothing", async () => {
		const body = jpeg({ extra: [], width: 1000, height: 800 });
		expect((await put(s, `/api/blob/o1/${blobId}/display`, { body })).status).toBe(400);
		const res = await put(s, `/api/blob/o1/${blobId}/display`, { body, sha256: "0".repeat(64) });
		expect(res.status).toBe(400);
		expect(s.r2.objects.size).toBe(0);
	});

	it("deletes and rejects a file that fails verification", async () => {
		const res = await put(s, `/api/blob/o1/${blobId}/avatar`, {
			body: jpeg({ width: 128, height: 128 }),
		});
		expect(res.status).toBe(422);
		expect(s.r2.objects.size).toBe(0);
		expect((await row(s, blobId))?.variants).toEqual({});
	});

	it("deletes and rejects a variant over its longest edge", async () => {
		const res = await put(s, `/api/blob/o1/${blobId}/avatar`, {
			body: jpeg({ extra: [], width: 256, height: 256 }),
		});
		expect(res.status).toBe(422);
		expect(s.r2.objects.size).toBe(0);
	});

	it("a row discarded during put() loses its bytes", async () => {
		s.r2.hooks.onPut = () => s.store.discard(MEMBER, [blobId]).then(() => undefined);
		const res = await put(s, `/api/blob/o1/${blobId}/avatar`);
		expect(res.status).toBe(409);
		expect(s.r2.objects.size).toBe(0);
		expect(await row(s, blobId)).toBeUndefined();
	});
});

describe("GET /api/blob/<org>/<blob>/<variant>", () => {
	let s: ReturnType<typeof setup>;
	const bytes = jpeg({ extra: [], width: 128, height: 128 });

	/** An attached `profilePhoto` with both variants landed, owned by `ownerId`. */
	const attached = async (
		id: string,
		{ ownerKind = "profile", ownerId = "p", org = "o1", status = "attached" } = {}
	) => {
		const [kind, small] =
			ownerKind === "memory" ? ["memoryImage", "thumb"] : ["profilePhoto", "avatar"];
		s.h.fresh.sqlite.exec(`
			INSERT INTO blob (id, organizationId, mediaKind, status, ownerKind, ownerId, uploadedByUserId,
				size, variants, createdAt)
			VALUES ('${id}', '${org}', '${kind}', '${status}', '${ownerKind}', '${ownerId}', 'u-member',
				${bytes.length * 2}, '{"${small}":${bytes.length},"display":${bytes.length}}', 0);
		`);
		await s.r2.bucket.put(`${org}/${id}/${small}`, bytes);
		await s.r2.bucket.put(`${org}/${id}/display`, bytes);
	};

	beforeEach(async () => {
		s = setup();
		await s.h.seed(
			{ id: "p", status: "active" },
			{ id: "gone", status: "inactive" },
			{ id: "mine", status: "inactive", userId: MEMBER.userId }
		);
		await attached("b-p");
	});

	it("serves an attached photo to a member with private immutable caching", async () => {
		const res = await get(s, "/api/blob/o1/b-p/avatar", MEMBER.userId);
		expect(res.status).toBe(200);
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
		expect(Object.fromEntries(res.headers)).toMatchObject({
			"content-type": "image/jpeg",
			"cache-control": "private, max-age=86400, immutable",
			"x-content-type-options": "nosniff",
			"content-security-policy": "sandbox",
		});
		expect(res.headers.get("etag")).toMatch(/^".+"$/);
		expect(res.headers.has("content-disposition")).toBe(false);
	});

	it("?download=1 adds an attachment disposition with no filename", async () => {
		const res = await get(s, "/api/blob/o1/b-p/avatar?download=1", MEMBER.userId);
		expect(res.headers.get("content-disposition")).toBe("attachment");
	});

	it("gives one identical 404 for non-member, wrong org, missing Blob and pending", async () => {
		const { blobId: pending } = await s.store.start(MEMBER, {
			mediaKind: "profilePhoto",
			size: 1000,
		});
		await s.r2.bucket.put(`o1/${pending}/avatar`, bytes);
		const responses = await Promise.all([
			get(s, "/api/blob/o1/b-p/avatar", "u-outsider"),
			get(s, "/api/blob/o1/b-p/avatar", null),
			get(s, "/api/blob/o2/b-p/avatar", MEMBER.userId),
			get(s, "/api/blob/o1/nope/avatar", MEMBER.userId),
			get(s, `/api/blob/o1/${pending}/avatar`, MEMBER.userId),
		]);
		const shapes = await Promise.all(
			responses.map(async (r) => ({
				status: r.status,
				headers: Object.fromEntries(r.headers),
				body: await r.text(),
			}))
		);
		expect(shapes[0]!.status).toBe(404);
		for (const shape of shapes) expect(shape).toEqual(shapes[0]);
	});

	it("locked org → 403 for a member (non-member still 404)", async () => {
		s.h.fresh.sqlite.exec("UPDATE orgBilling SET trialEndsAt = 0 WHERE organizationId = 'o1'");
		const res = await get(s, "/api/blob/o1/b-p/avatar", MEMBER.userId);
		expect(res.status).toBe(403);
		expect((await get(s, "/api/blob/o1/b-p/avatar", "u-outsider")).status).toBe(404);
	});

	it("checks the URL's org, not an active org: member of o2 reads o2's Blob", async () => {
		await s.h.fresh.sqlite.exec(
			`INSERT INTO communityProfile (id, firstName, lastName, status, organizationId) VALUES ('p2', 'A', 'B', 'active', 'o2')`
		);
		await attached("b-o2", { org: "o2", ownerId: "p2" });
		expect((await get(s, "/api/blob/o2/b-o2/avatar", MEMBER.userId)).status).toBe(200);
		expect((await get(s, "/api/blob/o2/b-o2/avatar", "u-other")).status).toBe(404);
	});

	it("hides a photo on an inactive profile from a plain member; owner, admin, linked user see it", async () => {
		await attached("b-gone", { ownerId: "gone" });
		await attached("b-mine", { ownerId: "mine" });
		expect((await get(s, "/api/blob/o1/b-gone/avatar", MEMBER.userId)).status).toBe(404);
		expect((await get(s, "/api/blob/o1/b-gone/avatar", "u-owner")).status).toBe(200);
		expect((await get(s, "/api/blob/o1/b-gone/avatar", "u-admin")).status).toBe(200);
		expect((await get(s, "/api/blob/o1/b-mine/avatar", MEMBER.userId)).status).toBe(200);
		expect((await get(s, "/api/blob/o1/b-mine/avatar", "u-other")).status).toBe(404);
	});

	it("serves a Change Request owned Blob to submitter and owner/admin only", async () => {
		s.h.fresh.sqlite.exec(`
			INSERT INTO changeRequest (id, organizationId, profileId, profileName, kind, status,
				submitterUserId, submitterName, createdAt)
			VALUES ('cr1', 'o1', 'p', 'P Doe', 'info', 'pending', 'u-member', 'Mira Member', 0);
		`);
		await attached("b-cr", { ownerKind: "changeRequest", ownerId: "cr1" });
		expect((await get(s, "/api/blob/o1/b-cr/avatar", MEMBER.userId)).status).toBe(200);
		expect((await get(s, "/api/blob/o1/b-cr/avatar", "u-owner")).status).toBe(200);
		expect((await get(s, "/api/blob/o1/b-cr/avatar", "u-admin")).status).toBe(200);
		expect((await get(s, "/api/blob/o1/b-cr/avatar", "u-other")).status).toBe(404);
	});

	it("serves a Memory's gallery image to any member of its org only", async () => {
		s.h.fresh.sqlite.exec(`
			INSERT INTO post (id, organizationId, kind, authorUserId, authorName, createdAt)
				VALUES ('m1', 'o1', 'memory', 'u-owner', 'O', 0), ('m2', 'o2', 'memory', 'u-outsider', 'X', 0);
		`);
		await attached("b-mem", { ownerKind: "memory", ownerId: "m1" });
		await attached("b-memgone", { ownerKind: "memory", ownerId: "removed" });
		// Owner row in another org never vouches for this org's Blob.
		await attached("b-cross", { ownerKind: "memory", ownerId: "m2" });
		for (const user of [MEMBER.userId, "u-other", "u-owner"]) {
			expect((await get(s, "/api/blob/o1/b-mem/thumb", user)).status).toBe(200);
			expect((await get(s, "/api/blob/o1/b-memgone/thumb", user)).status).toBe(404);
			expect((await get(s, "/api/blob/o1/b-cross/thumb", user)).status).toBe(404);
		}
		expect((await get(s, "/api/blob/o1/b-mem/thumb", "u-outsider")).status).toBe(404);
	});

	it("404s an attached Blob whose owner row is gone, and a deleted Blob", async () => {
		await attached("b-orphan", { ownerId: "nobody" });
		await attached("b-del", { status: "deleted" });
		expect((await get(s, "/api/blob/o1/b-orphan/avatar", "u-owner")).status).toBe(404);
		expect((await get(s, "/api/blob/o1/b-del/avatar", "u-owner")).status).toBe(404);
	});

	it("revalidates with 304 after an R2 head(), and 404 once the object is gone", async () => {
		const first = await get(s, "/api/blob/o1/b-p/avatar", MEMBER.userId);
		const etag = first.headers.get("etag")!;
		const again = await get(s, "/api/blob/o1/b-p/avatar", MEMBER.userId, {
			"if-none-match": etag,
		});
		expect(again.status).toBe(304);
		expect(again.headers.get("etag")).toBe(etag);

		await s.r2.bucket.delete("o1/b-p/avatar");
		const gone = await get(s, "/api/blob/o1/b-p/avatar", MEMBER.userId, {
			"if-none-match": etag,
		});
		expect(gone.status).toBe(404);
	});

	it("serves no variant the Blob hasn't landed", async () => {
		expect((await get(s, "/api/blob/o1/b-p/thumb", "u-owner")).status).toBe(404);
	});

	describe("isolate memo", () => {
		it("a member's second GET inside the TTL makes no D1 query", async () => {
			expect((await get(s, "/api/blob/o1/b-p/avatar", MEMBER.userId)).status).toBe(200);
			s.queries.n = 0;
			s.getUserId.mockClear();
			s.clock.t += 29_000;
			const res = await get(s, "/api/blob/o1/b-p/display", MEMBER.userId);
			expect(res.status).toBe(200);
			expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
			expect(res.headers.get("content-type")).toBe("image/jpeg");
			expect(s.queries.n).toBe(0);
			expect(s.getUserId).not.toHaveBeenCalled();
		});

		it("an attached Memory image is unrestricted: a memo hit makes no D1 query", async () => {
			s.h.fresh.sqlite.exec(`
				INSERT INTO post (id, organizationId, kind, authorUserId, authorName, createdAt)
					VALUES ('m1', 'o1', 'memory', 'u-owner', 'O', 0);
			`);
			await attached("b-mem", { ownerKind: "memory", ownerId: "m1" });
			expect((await get(s, "/api/blob/o1/b-p/avatar", "u-other")).status).toBe(200);
			s.queries.n = 0;
			expect((await get(s, "/api/blob/o1/b-mem/thumb", "u-other")).status).toBe(200);
			expect(s.queries.n).toBe(0);
		});

		it("reads D1 again once the TTL passes", async () => {
			await get(s, "/api/blob/o1/b-p/avatar", MEMBER.userId);
			s.queries.n = 0;
			s.clock.t += 31_000;
			expect((await get(s, "/api/blob/o1/b-p/avatar", MEMBER.userId)).status).toBe(200);
			expect(s.queries.n).toBeGreaterThan(0);
		});

		it("a restricted Blob still gets the full check on a memo hit", async () => {
			await attached("b-gone", { ownerId: "gone" });
			await attached("b-mine", { ownerId: "mine" });
			await attached("b-orphan", { ownerId: "nobody" });
			await attached("b-del", { status: "deleted" });
			for (const user of [MEMBER.userId, "u-other", "u-owner"]) {
				expect((await get(s, "/api/blob/o1/b-p/avatar", user)).status).toBe(200);
			}
			s.queries.n = 0;
			expect((await get(s, "/api/blob/o1/b-gone/avatar", MEMBER.userId)).status).toBe(404);
			expect(s.queries.n).toBeGreaterThan(0);
			expect((await get(s, "/api/blob/o1/b-gone/avatar", "u-owner")).status).toBe(200);
			expect((await get(s, "/api/blob/o1/b-mine/avatar", MEMBER.userId)).status).toBe(200);
			expect((await get(s, "/api/blob/o1/b-mine/avatar", "u-other")).status).toBe(404);
			expect((await get(s, "/api/blob/o1/b-orphan/avatar", "u-owner")).status).toBe(404);
			expect((await get(s, "/api/blob/o1/b-del/avatar", "u-owner")).status).toBe(404);
		});

		it("memoised roles are per org: a memo hit never admits a non-member", async () => {
			await s.h.fresh.sqlite.exec(
				`INSERT INTO communityProfile (id, firstName, lastName, status, organizationId) VALUES ('p2', 'A', 'B', 'active', 'o2')`
			);
			await attached("b-o2", { org: "o2", ownerId: "p2" });
			expect((await get(s, "/api/blob/o1/b-p/avatar", "u-other")).status).toBe(200);
			expect((await get(s, "/api/blob/o2/b-o2/avatar", "u-other")).status).toBe(404);
			expect((await get(s, "/api/blob/o2/b-o2/avatar", MEMBER.userId)).status).toBe(200);
		});

		it("a pending Blob is never served from the memo", async () => {
			await get(s, "/api/blob/o1/b-p/avatar", MEMBER.userId);
			s.clock.t += 31_000;
			const { blobId } = await s.store.start(MEMBER, { mediaKind: "profilePhoto", size: 1000 });
			await s.r2.bucket.put(`o1/${blobId}/avatar`, bytes);
			expect((await get(s, `/api/blob/o1/${blobId}/avatar`, MEMBER.userId)).status).toBe(404);
		});
	});
});

describe("video", () => {
	let s: ReturnType<typeof setup>;
	const clip = (opts: MovieOptions = {}) =>
		materialize(movie({ mdatSize: 5000, ...opts })) as Uint8Array<ArrayBuffer>;
	const startVideo = async (contentType: "video/mp4" | "video/quicktime" = "video/quicktime") =>
		(await s.store.start(MEMBER, { mediaKind: "memoryVideo", size: 2_000_000, contentType }))
			.blobId;

	beforeEach(() => {
		s = setup();
	});

	describe("PUT", () => {
		it("lands a verified video; stores duration, rotated size, and its type as R2 metadata", async () => {
			const id = await startVideo();
			const body = clip({ brand: "qt  ", codec: "hvc1", rotation: 90, durationMs: 30_000 });
			const res = await put(s, `/api/blob/o1/${id}/video`, { body });
			expect(res.status).toBe(200);
			expect(await row(s, id)).toMatchObject({
				variants: { video: body.length },
				durationMs: 30_000,
				width: 1080,
				height: 1920,
				contentType: "video/quicktime",
			});
			expect(s.r2.objects.get(`o1/${id}/video`)?.contentType).toBe("video/quicktime");
		});

		it("deletes and rejects leftover location data, or a type other than declared", async () => {
			const id = await startVideo();
			const located = clip({ brand: "qt  ", moovExtra: [udtaLocation()] });
			expect((await put(s, `/api/blob/o1/${id}/video`, { body: located })).status).toBe(422);
			const mp4 = clip({ brand: "isom" });
			expect((await put(s, `/api/blob/o1/${id}/video`, { body: mp4 })).status).toBe(422);
			expect(s.r2.objects.size).toBe(0);
			expect((await row(s, id))?.variants).toEqual({});
		});

		it("rejects a video over 95,000,000 bytes before put()", async () => {
			const id = await startVideo();
			const res = await put(s, `/api/blob/o1/${id}/video`, { length: "95000001" });
			expect(res.status).toBe(413);
			expect(s.r2.objects.size).toBe(0);
		});

		it("lands a JPEG poster up to 1280 px without touching the video's size", async () => {
			const id = await startVideo();
			await put(s, `/api/blob/o1/${id}/video`, { body: clip({ brand: "qt  " }) });
			const poster = jpeg({ extra: [], width: 1280, height: 720 });
			expect((await put(s, `/api/blob/o1/${id}/poster`, { body: poster })).status).toBe(200);
			expect(await row(s, id)).toMatchObject({ width: 1920, height: 1080 });
			const big = jpeg({ extra: [], width: 1281, height: 720 });
			expect((await put(s, `/api/blob/o1/${id}/poster`, { body: big })).status).toBe(422);
		});
	});

	describe("GET", () => {
		const bytes = Uint8Array.from({ length: 1000 }, (_, i) => i % 251);

		beforeEach(async () => {
			s.h.fresh.sqlite.exec(`
				INSERT INTO post (id, organizationId, kind, authorUserId, authorName, createdAt)
					VALUES ('m1', 'o1', 'memory', 'u-owner', 'O', 0);
				INSERT INTO blob (id, organizationId, mediaKind, status, ownerKind, ownerId,
					uploadedByUserId, size, variants, contentType, createdAt)
				VALUES ('v1', 'o1', 'memoryVideo', 'attached', 'memory', 'm1', 'u-member', 1000,
					'{"video":1000}', 'video/quicktime', 0);
			`);
			await s.r2.bucket.put("o1/v1/video", bytes, {
				httpMetadata: { contentType: "video/quicktime" },
			});
		});

		const range = (value: string, extra: Record<string, string> = {}) =>
			get(s, "/api/blob/o1/v1/video", MEMBER.userId, { range: value, ...extra });

		it("an attached Memory video is unrestricted: memo hit, no D1, stored type", async () => {
			expect((await range("bytes=0-1")).status).toBe(206);
			s.queries.n = 0;
			const res = await get(s, "/api/blob/o1/v1/video", MEMBER.userId);
			expect(res.status).toBe(200);
			expect(s.queries.n).toBe(0);
			expect(res.headers.get("content-type")).toBe("video/quicktime");
			expect(res.headers.get("accept-ranges")).toBe("bytes");
			expect(res.headers.get("content-length")).toBe("1000");
		});

		it("a Memory video whose Memory is gone is 404", async () => {
			s.h.fresh.sqlite.exec(`DELETE FROM post WHERE id = 'm1'`);
			expect((await range("bytes=0-1")).status).toBe(404);
		});

		it("0-1 probe gets a hand-built 206", async () => {
			const res = await range("bytes=0-1");
			expect(res.status).toBe(206);
			expect(res.headers.get("content-range")).toBe("bytes 0-1/1000");
			expect(res.headers.get("content-length")).toBe("2");
			expect(res.headers.get("content-type")).toBe("video/quicktime");
			expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes.slice(0, 2));
		});

		it("open-ended and past-the-end ranges run to the last byte", async () => {
			const res = await range("bytes=990-");
			expect(res.status).toBe(206);
			expect(res.headers.get("content-range")).toBe("bytes 990-999/1000");
			expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes.slice(990));
			const past = await range("bytes=995-5000");
			expect(past.headers.get("content-range")).toBe("bytes 995-999/1000");
			expect((await past.arrayBuffer()).byteLength).toBe(5);
		});

		it("suffix range serves the last n bytes", async () => {
			const res = await range("bytes=-10");
			expect(res.status).toBe(206);
			expect(res.headers.get("content-range")).toBe("bytes 990-999/1000");
			expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes.slice(990));
		});

		it("multi-range and junk get the whole file as 200", async () => {
			for (const value of ["bytes=0-1,5-9", "items=0-1", "bytes=5-2"]) {
				const res = await range(value);
				expect(res.status).toBe(200);
				expect((await res.arrayBuffer()).byteLength).toBe(1000);
			}
		});

		it("a start past the end is 416 with the size", async () => {
			const res = await range("bytes=1000-");
			expect(res.status).toBe(416);
			expect(res.headers.get("content-range")).toBe("bytes */1000");
		});

		it("If-Range: matching ETag gets 206, stale ETag the whole file", async () => {
			const etag = (await get(s, "/api/blob/o1/v1/video", MEMBER.userId)).headers.get("etag")!;
			const fresh = await range("bytes=0-1", { "if-range": etag });
			expect(fresh.status).toBe(206);
			const stale = await range("bytes=0-1", { "if-range": '"old"' });
			expect(stale.status).toBe(200);
			expect((await stale.arrayBuffer()).byteLength).toBe(1000);
			expect(stale.headers.get("etag")).toBe(etag);
		});
	});
});
