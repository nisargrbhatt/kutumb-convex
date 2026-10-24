import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { communityAddress, communityProfile, communityProfileCustomField } from "@/db/schema";
import type { Actor } from "@/domain/permission";
import { freshDb } from "@/test/sqliteDb";
import { searchProfiles } from "./profiles";

const ACTOR: Actor = { userId: "u1", organizationId: "o1", role: "member" };

type Seed = Partial<typeof communityProfile.$inferInsert> & { id: string };

describe("search_profiles filters", () => {
	let fresh: ReturnType<typeof freshDb>;
	let db: ReturnType<typeof freshDb>["db"];

	const seed = async (rows: Seed[]) => {
		for (const r of rows)
			await db
				.insert(communityProfile)
				.values({ firstName: r.id, lastName: "Doe", status: "active", organizationId: "o1", ...r });
	};
	const ids = async (filter: Record<string, unknown>) =>
		(await searchProfiles(db, ACTOR, filter)).items.map((i) => i.id).sort();

	beforeEach(async () => {
		fresh = freshDb();
		db = fresh.db;
		fresh.sqlite.exec(`
			INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('u1', 'U1', 'u1@x.test', 1, 0, 0);
			INSERT INTO organization (id, name, slug, created_at) VALUES ('o1', 'Org 1', 'o1', 0), ('o2', 'Org 2', 'o2', 0);
		`);
		await seed([
			{ id: "a", gender: "male", bloodGroup: "A+", dateOfBirth: "1990-05-17T00:00:00.000Z" },
			{ id: "b", gender: "female", bloodGroup: "O-", dateOfBirth: "1985-01-01T00:00:00.000Z" },
			{
				id: "c",
				gender: "female",
				bloodGroup: "A+",
				dateOfBirth: "2000-12-31T00:00:00.000Z",
				dateOfDeath: "2020-01-01T00:00:00.000Z",
			},
			{ id: "d" },
			{ id: "inact", status: "inactive", bloodGroup: "A+" },
			{ id: "other-org", organizationId: "o2", bloodGroup: "A+" },
		]);
	});

	describe("core fields", () => {
		it("bloodGroup is OR within, active + own org only", async () => {
			expect(await ids({ bloodGroup: ["A+"] })).toEqual(["a", "c"]);
			expect(await ids({ bloodGroup: ["A+", "O-"] })).toEqual(["a", "b", "c"]);
		});

		it("AND across fields", async () => {
			expect(await ids({ bloodGroup: ["A+", "O-"], gender: "female" })).toEqual(["b", "c"]);
			expect(await ids({ bloodGroup: ["A+"], gender: "female", query: "c" })).toEqual(["c"]);
		});

		it("born range is inclusive on calendar days; undated profiles never match", async () => {
			expect(await ids({ bornOnOrAfter: "1990-05-17" })).toEqual(["a", "c"]);
			expect(await ids({ bornOnOrBefore: "1990-05-17" })).toEqual(["a", "b"]);
			expect(await ids({ bornOnOrAfter: "1986-01-01", bornOnOrBefore: "1999-12-31" })).toEqual([
				"a",
			]);
		});

		it("living splits on dateOfDeath", async () => {
			expect(await ids({ living: true })).toEqual(["a", "b", "d"]);
			expect(await ids({ living: false })).toEqual(["c"]);
		});

		it("an empty filter matches every active profile", async () => {
			expect(await ids({})).toEqual(["a", "b", "c", "d"]);
		});

		it("bad day strings → Invalid with a format hint", async () => {
			for (const f of [{ bornOnOrAfter: "17/05/1990" }, { bornOnOrBefore: "2023-02-29" }]) {
				await expect(searchProfiles(db, ACTOR, f)).rejects.toMatchObject({
					kind: "Invalid",
					message: expect.stringContaining("YYYY-MM-DD"),
				});
			}
		});
	});

	describe("places", () => {
		const address = (id: string, profileId: string, city: string, state = "MH", country = "IN") =>
			db.insert(communityAddress).values({
				id,
				communityProfileId: profileId,
				line1: "1 Main St",
				city,
				state,
				country,
				postalCode: "1",
			});

		beforeEach(async () => {
			await address("ad1", "a", "Pune");
			await address("ad2", "b", "  PUNE ", "mh");
			await address("ad3", "b", "Mumbai");
			await address("ad4", "c", "Springfield", "Illinois", "US");
			await address("ad5", "c", "Chicago", "Missouri", "US");
			await address("ad6", "inact", "Pune");
		});

		it("case-insensitive trimmed exact match on any address", async () => {
			expect(await ids({ city: "pune" })).toEqual(["a", "b"]);
			expect(await ids({ city: " MUMBAI " })).toEqual(["b"]);
			expect(await ids({ city: "Pun" })).toEqual([]);
		});

		it("a multi-address profile matches on any of its addresses", async () => {
			expect(await ids({ city: "Mumbai" })).toEqual(["b"]);
			expect(await ids({ city: "Pune" })).toContain("b");
		});

		it("state and country filter the same way, ANDed", async () => {
			expect(await ids({ state: "mh" })).toEqual(["a", "b"]);
			expect(await ids({ country: "us" })).toEqual(["c"]);
			expect(await ids({ country: "IN", city: "Mumbai" })).toEqual(["b"]);
		});

		it("several place keys must hold on the same address", async () => {
			expect(await ids({ city: "Springfield", state: "Illinois" })).toEqual(["c"]);
			// Springfield and Missouri exist for c, but on different addresses.
			expect(await ids({ city: "Springfield", state: "Missouri" })).toEqual([]);
		});

		it("addresses of non-active / other-org profiles never match", async () => {
			await address("ad7", "other-org", "Pune");
			expect(await ids({ city: "Pune" })).toEqual(["a", "b"]);
		});
	});

	describe("custom field filters", () => {
		const defs = [
			["ft", "Gotra", "text"],
			["fn", "Height", "number"],
			["fd", "Anniversary", "date"],
			["fb", "Donor", "boolean"],
		] as const;

		beforeEach(async () => {
			for (const [id, label, type] of defs)
				await db
					.insert(communityProfileCustomField)
					.values({ id, label, type, organizationId: "o1" });
			const data = (
				id: string,
				customFieldData: Record<string, string | number | boolean | null>
			) => db.update(communityProfile).set({ customFieldData }).where(eq(communityProfile.id, id));
			await data("a", {
				ft: "Kashyap",
				fn: 180,
				fd: "2010-06-15T00:00:00.000Z",
				fb: true,
			});
			await data("b", { ft: "kashyap muni", fn: 160.5, fd: "2015-01-01T00:00:00.000Z", fb: false });
			await data("c", { ft: "Bharadwaj_100%", fn: 0, fd: null, fb: null });
			await data("other-org", { ft: "Kashyap" });
		});

		const cf = (field: string, op: string, value?: string | number | boolean) => ({
			customFieldFilters: [{ field, op, value }],
		});

		it("text eq is case-insensitive and trimmed, field by id or label", async () => {
			expect(await ids(cf("ft", "eq", " KASHYAP "))).toEqual(["a"]);
			expect(await ids(cf("gotra", "eq", "kashyap"))).toEqual(["a"]);
		});

		it("text contains is case-insensitive and treats % _ literally", async () => {
			expect(await ids(cf("Gotra", "contains", "KASH"))).toEqual(["a", "b"]);
			expect(await ids(cf("Gotra", "contains", "_100%"))).toEqual(["c"]);
			expect(await ids(cf("Gotra", "contains", "%"))).toEqual(["c"]);
		});

		it("number eq/gt/gte/lt/lte", async () => {
			expect(await ids(cf("Height", "eq", 180))).toEqual(["a"]);
			expect(await ids(cf("Height", "gt", 160.5))).toEqual(["a"]);
			expect(await ids(cf("Height", "gte", 160.5))).toEqual(["a", "b"]);
			expect(await ids(cf("Height", "lt", 160.5))).toEqual(["c"]);
			expect(await ids(cf("Height", "lte", 160.5))).toEqual(["b", "c"]);
		});

		it("date eq/before/after compare calendar days", async () => {
			expect(await ids(cf("Anniversary", "eq", "2010-06-15"))).toEqual(["a"]);
			expect(await ids(cf("Anniversary", "before", "2015-01-01"))).toEqual(["a"]);
			expect(await ids(cf("Anniversary", "after", "2010-06-15"))).toEqual(["b"]);
			expect(await ids(cf("Anniversary", "after", "2000-01-01"))).toEqual(["a", "b"]);
		});

		it("boolean eq", async () => {
			expect(await ids(cf("Donor", "eq", true))).toEqual(["a"]);
			expect(await ids(cf("Donor", "eq", false))).toEqual(["b"]);
		});

		it("isSet / isNotSet: null, missing and blank text are unset", async () => {
			expect(await ids(cf("Anniversary", "isSet"))).toEqual(["a", "b"]);
			expect(await ids(cf("Anniversary", "isNotSet"))).toEqual(["c", "d"]);
			expect(await ids(cf("Donor", "isNotSet"))).toEqual(["c", "d"]);
			// 0 is a set number.
			expect(await ids(cf("Height", "isSet"))).toEqual(["a", "b", "c"]);
			await db
				.update(communityProfile)
				.set({ customFieldData: { ft: "  " } })
				.where(eq(communityProfile.id, "d"));
			expect(await ids(cf("Gotra", "isNotSet"))).toEqual(["d"]);
		});

		it("AND across several filters (and with core filters)", async () => {
			expect(
				await ids({
					customFieldFilters: [
						{ field: "Gotra", op: "contains", value: "kash" },
						{ field: "Height", op: "gt", value: 170 },
					],
				})
			).toEqual(["a"]);
			expect(await ids({ gender: "female", ...cf("Gotra", "contains", "kash") })).toEqual(["b"]);
		});

		it("a profile without customFieldData is unset, never matched by comparisons", async () => {
			expect(await ids(cf("Height", "lt", 1000))).toEqual(["a", "b", "c"]);
		});

		describe("Invalid with a hint", () => {
			const invalid = async (filters: unknown[], message: RegExp | string) => {
				await expect(
					searchProfiles(db, ACTOR, { customFieldFilters: filters as never })
				).rejects.toMatchObject({ kind: "Invalid", message: expect.stringMatching(message) });
			};

			it("op that does not fit the type lists the allowed ops", async () => {
				await invalid([{ field: "Gotra", op: "gt", value: "x" }], /"gt".*text.*eq, contains/);
				await invalid([{ field: "Height", op: "contains", value: "1" }], /number.*eq, gt, gte/);
				await invalid([{ field: "Anniversary", op: "gt", value: "2010-01-01" }], /before, after/);
				await invalid([{ field: "Donor", op: "lt", value: true }], /date|boolean.*eq/);
			});

			it("mistyped or missing value says what is expected", async () => {
				await invalid([{ field: "Height", op: "eq", value: "180" }], /JSON number/);
				await invalid([{ field: "Height", op: "eq" }], /needs "value"/);
				await invalid([{ field: "Donor", op: "eq", value: "true" }], /true or false/);
				await invalid([{ field: "Anniversary", op: "eq", value: "15/06/2010" }], /YYYY-MM-DD/);
				await invalid([{ field: "Gotra", op: "eq", value: 5 }], /string/);
			});

			it("more than 5 filters", async () => {
				const six = Array.from({ length: 6 }, () => ({ field: "Gotra", op: "isSet" }));
				await invalid(six, /At most 5 customFieldFilters/);
				await expect(
					searchProfiles(db, ACTOR, { customFieldFilters: six.slice(0, 5) as never })
				).resolves.toBeTruthy();
			});

			it("unknown field lists the valid ones; ambiguous label lists ids", async () => {
				await invalid([{ field: "Nope", op: "isSet" }], /Valid fields: .*Gotra \(id ft, text\)/);
				await db
					.insert(communityProfileCustomField)
					.values({ id: "ft2", label: "GOTRA", type: "text", organizationId: "o1" });
				await invalid([{ field: "gotra", op: "isSet" }], /ambiguous.*ft, ft2/);
			});
		});

		it("values written through drizzle (blob JSON) are filterable, not only text seeds", async () => {
			// `data()` above wrote via drizzle's blob-json mapper; raw text rows must work too.
			fresh.sqlite.exec(`UPDATE communityProfile SET customFieldData = '{"fn":7}' WHERE id = 'd'`);
			expect(await ids(cf("Height", "eq", 7))).toEqual(["d"]);
			expect(await ids(cf("Height", "eq", 180))).toEqual(["a"]);
		});
	});

	describe("echo", () => {
		beforeEach(async () => {
			await db.insert(communityProfileCustomField).values([
				{ id: "ft", label: "Gotra", type: "text", organizationId: "o1" },
				{ id: "fd", label: "Anniversary", type: "date", organizationId: "o1" },
			]);
			await db
				.update(communityProfile)
				.set({ customFieldData: { ft: "Kashyap", fd: "2010-06-15T00:00:00.000Z" } })
				.where(eq(communityProfile.id, "a"));
			await db.insert(communityAddress).values([
				{
					id: "e1",
					communityProfileId: "a",
					line1: "x",
					city: "Pune",
					state: "MH",
					country: "IN",
					postalCode: "1",
				},
				{
					id: "e2",
					communityProfileId: "a",
					line1: "y",
					city: "pune",
					state: "KA",
					country: "IN",
					postalCode: "2",
				},
				{
					id: "e3",
					communityProfileId: "a",
					line1: "z",
					city: "Delhi",
					state: "DL",
					country: "IN",
					postalCode: "3",
				},
			]);
		});

		const item = async (filter: Record<string, unknown>) =>
			(await searchProfiles(db, ACTOR, filter)).items.find((i) => i.id === "a")!;
		const BASE = ["fullName", "gender", "id", "nickName", "status"];

		it("no filter: core keys only", async () => {
			expect(Object.keys(await item({})).sort()).toEqual(BASE);
		});

		it("echoes only the filtered fields", async () => {
			expect(Object.keys(await item({ gender: "male", query: "a" })).sort()).toEqual(BASE);
			expect(await item({ bloodGroup: ["A+"] })).toMatchObject({ bloodGroup: "A+" });
			expect(Object.keys(await item({ bloodGroup: ["A+"] })).sort()).toEqual(
				[...BASE, "bloodGroup"].sort()
			);
			const born = await item({ bornOnOrAfter: "1990-01-01" });
			expect(born.dateOfBirth).toBe("1990-05-17");
			expect(Object.keys(born)).not.toContain("bloodGroup");
			const living = await item({ living: true });
			expect(living.dateOfDeath).toBeNull();
			expect(Object.keys(living)).not.toContain("dateOfBirth");
		});

		it("places: only matching addresses, only the filtered parts, distinct", async () => {
			expect((await item({ city: "PUNE" })).addresses).toEqual([
				{ city: "Pune" },
				{ city: "pune" },
			]);
			expect((await item({ city: "pune", state: "ka" })).addresses).toEqual([
				{ city: "pune", state: "KA" },
			]);
			expect((await item({ country: "in" })).addresses).toEqual([{ country: "IN" }]);
		});

		it("custom fields: filtered ones only, dates as YYYY-MM-DD, deduped", async () => {
			const a = await item({
				customFieldFilters: [
					{ field: "Gotra", op: "isSet" },
					{ field: "ft", op: "contains", value: "kash" },
				],
			});
			expect(a.customFields).toEqual([
				{ id: "ft", label: "Gotra", type: "text", value: "Kashyap" },
			]);
			expect(
				(await item({ customFieldFilters: [{ field: "Anniversary", op: "isSet" }] })).customFields
			).toEqual([{ id: "fd", label: "Anniversary", type: "date", value: "2010-06-15" }]);
			expect(Object.keys(a).sort()).toEqual([...BASE, "customFields"].sort());
		});
	});
});
