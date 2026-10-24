import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { communityAddress, communityProfile, communityProfileCustomField } from "@/db/schema";
import type { Actor } from "@/domain/permission";
import { freshDb } from "@/test/sqliteDb";
import { countProfiles } from "./profileAggregates";

const ACTOR: Actor = { userId: "u1", organizationId: "o1", role: "member" };
const NOW = new Date("2026-10-24T10:00:00.000Z");

type Seed = Partial<typeof communityProfile.$inferInsert> & { id: string };

describe("count_profiles", () => {
	let fresh: ReturnType<typeof freshDb>;
	let db: ReturnType<typeof freshDb>["db"];

	const seed = async (rows: Seed[]) => {
		for (const r of rows)
			await db
				.insert(communityProfile)
				.values({ firstName: r.id, lastName: "Doe", status: "active", organizationId: "o1", ...r });
	};
	const count = (input: Record<string, unknown>) => countProfiles(db, ACTOR, input, NOW);
	const groups = async (input: Record<string, unknown>) =>
		Object.fromEntries(((await count(input)).groups ?? []).map((g) => [String(g.value), g.count]));
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
				dateOfBirth: "1999-12-31T00:00:00.000Z",
				dateOfDeath: "2020-01-01T00:00:00.000Z",
			},
			{ id: "d" },
			{ id: "inact", status: "inactive", gender: "male", bloodGroup: "A+" },
			{ id: "other-org", organizationId: "o2", gender: "male" },
		]);
	});

	describe("total", () => {
		it("counts active profiles of the org; echoes asOf as a calendar day", async () => {
			expect(await count({})).toEqual({
				total: 4,
				asOf: "2026-10-24",
				otherGroups: 0,
				otherCount: 0,
			});
		});

		it("applies the shared filters", async () => {
			expect((await count({ gender: "female" })).total).toBe(2);
			expect((await count({ gender: "female", living: true })).total).toBe(1);
			expect((await count({ bloodGroup: ["A+"], bornOnOrAfter: "1995-01-01" })).total).toBe(1);
		});

		it("bad filter input is Invalid", async () => {
			await expect(count({ bornOnOrAfter: "nope" })).rejects.toMatchObject({ kind: "Invalid" });
		});
	});

	describe("core dimensions", () => {
		it("gender, with a null bucket", async () => {
			expect(await groups({ groupBy: { core: "gender" } })).toEqual({
				female: 2,
				male: 1,
				null: 1,
			});
		});

		it("bloodGroup respects filters", async () => {
			expect(await groups({ groupBy: { core: "bloodGroup" } })).toEqual({
				"A+": 2,
				"O-": 1,
				null: 1,
			});
			expect(await groups({ groupBy: { core: "bloodGroup" }, gender: "female" })).toEqual({
				"A+": 1,
				"O-": 1,
			});
		});

		it("living is true/false, never null", async () => {
			expect(await count({ groupBy: { core: "living" } })).toMatchObject({
				groups: [
					{ value: true, count: 3 },
					{ value: false, count: 1 },
				],
			});
		});

		it("birthDecade labels the calendar-day decade; undated → null", async () => {
			await seed([
				// 23:30 UTC on the last day of 1979 stays in the 1970s.
				{ id: "edge", dateOfBirth: "1979-12-31T23:30:00.000Z" },
				{ id: "edge2", dateOfBirth: "1980-01-01T00:00:00.000Z" },
			]);
			expect(await groups({ groupBy: { core: "birthDecade" } })).toEqual({
				"1990s": 2,
				"1980s": 2,
				"1970s": 1,
				null: 1,
			});
		});

		it("is ordered by count desc, ties alphabetical, null last", async () => {
			const res = await count({ groupBy: { core: "gender" } });
			expect(res.groups!.map((g) => g.value)).toEqual(["female", "male", null]);
		});
	});

	describe("places", () => {
		beforeEach(async () => {
			await address("ad1", "a", "Pune");
			await address("ad2", "b", "  PUNE ", "mh");
			await address("ad3", "b", "pune", "MH"); // same profile, same city: counted once
			await address("ad4", "b", "Mumbai");
			await address("ad5", "c", "Pune");
			await address("ad6", "inact", "Delhi");
		});

		it("groups on lower(trim), labelled by the most common spelling; no address → null", async () => {
			const res = await count({ groupBy: { core: "city" } });
			expect(res.total).toBe(4);
			expect(res.groups).toEqual([
				{ value: "Pune", count: 3 },
				{ value: "Mumbai", count: 1 },
				{ value: null, count: 1 },
			]);
		});

		it("flags overlapping when a profile is in several groups", async () => {
			expect((await count({ groupBy: { core: "city" } })).overlapping).toBe(true);
			expect((await count({ groupBy: { core: "state" } })).overlapping).toBeUndefined();
			expect(await groups({ groupBy: { core: "state" } })).toEqual({ MH: 3, null: 1 });
			expect(await groups({ groupBy: { core: "country" } })).toEqual({ IN: 3, null: 1 });
		});

		it("combines with a place filter; equally common spellings tie alphabetically", async () => {
			// Only b matches: "PUNE" and "pune" tie, the earlier one labels the group.
			expect(await groups({ groupBy: { core: "city" }, city: "mumbai" })).toEqual({
				PUNE: 1,
				Mumbai: 1,
			});
		});
	});

	describe("custom fields", () => {
		beforeEach(async () => {
			await db.insert(communityProfileCustomField).values([
				{ id: "ft", label: "Gotra", type: "text", organizationId: "o1" },
				{ id: "fn", label: "Height", type: "number", organizationId: "o1" },
				{ id: "fd", label: "Anniversary", type: "date", organizationId: "o1" },
				{ id: "fb", label: "Vegetarian", type: "boolean", organizationId: "o1" },
			]);
			const data = (id: string, d: Record<string, string | number | boolean | null>) =>
				db.update(communityProfile).set({ customFieldData: d }).where(eq(communityProfile.id, id));
			await data("a", { ft: "Kashyap", fb: true });
			await data("b", { ft: " kashyap ", fb: false });
			await data("c", { ft: "Kashyap", fn: 1 });
			await data("d", { ft: "  ", fb: null });
		});

		it("text groups normalised, by id or label; blank/unset → null", async () => {
			const expected = { Kashyap: 3, null: 1 };
			expect(await groups({ groupBy: { field: "ft" } })).toEqual(expected);
			expect(await groups({ groupBy: { field: "gotra" } })).toEqual(expected);
		});

		it("boolean groups true/false/null", async () => {
			expect(await groups({ groupBy: { field: "Vegetarian" } })).toEqual({
				true: 1,
				false: 1,
				null: 2,
			});
		});

		it("number/date → Invalid with a range-filter hint", async () => {
			await expect(count({ groupBy: { field: "fn" } })).rejects.toMatchObject({
				kind: "Invalid",
				message: expect.stringMatching(/customFieldFilters.*gt/),
			});
			await expect(count({ groupBy: { field: "Anniversary" } })).rejects.toMatchObject({
				kind: "Invalid",
				message: expect.stringMatching(/customFieldFilters.*before/),
			});
		});

		it("unknown field → Invalid listing valid fields", async () => {
			await expect(count({ groupBy: { field: "Nope" } })).rejects.toMatchObject({
				kind: "Invalid",
				message: expect.stringContaining("Valid fields"),
			});
		});
	});

	describe("bounds", () => {
		it("folds beyond 50 groups by count desc; the null bucket is always kept", async () => {
			await db
				.insert(communityProfileCustomField)
				.values({ id: "ft", label: "Gotra", type: "text", organizationId: "o1" });
			await seed(
				Array.from({ length: 60 }, (_, i) => ({
					id: `n${i}`,
					customFieldData: { ft: `v${String(i).padStart(2, "0")}` },
				}))
			);
			// v00 gets a second profile so it must survive the fold.
			await seed([{ id: "dup", customFieldData: { ft: "v00" } }]);

			const res = await count({ groupBy: { field: "ft" } });
			expect(res.total).toBe(65);
			expect(res.groups).toHaveLength(50);
			// 4 seeded profiles without a value → null bucket, last.
			expect(res.groups!.at(-1)).toEqual({ value: null, count: 4 });
			expect(res.groups![0]).toEqual({ value: "v00", count: 2 });
			// 60 distinct values, 49 shown.
			expect(res.otherGroups).toBe(11);
			expect(res.otherCount).toBe(11);
		});
	});
});
