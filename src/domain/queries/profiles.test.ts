import { beforeEach, describe, expect, it } from "vitest";
import { communityProfile } from "@/db/schema";
import type { Actor } from "@/domain/permission";
import { freshDb } from "@/test/sqliteDb";
import { getCommunityProfileDetail, listCommunityMembers, searchProfiles } from "./profiles";

const ACTOR: Actor = { userId: "u1", organizationId: "o1", role: "member" };

type Seed = Partial<typeof communityProfile.$inferInsert> & { id: string; firstName: string };

describe("profile queries", () => {
	let db: ReturnType<typeof freshDb>["db"];

	const seed = (rows: Seed[]) =>
		db.insert(communityProfile).values(
			rows.map((r) => ({
				lastName: "Doe",
				status: "active" as const,
				organizationId: "o1",
				...r,
			}))
		);

	beforeEach(() => {
		const fresh = freshDb();
		db = fresh.db;
		fresh.sqlite.exec(`
			INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('u1', 'U1', 'u1@x.test', 1, 0, 0);
			INSERT INTO organization (id, name, slug, created_at) VALUES ('o1', 'Org 1', 'o1', 0), ('o2', 'Org 2', 'o2', 0);
		`);
	});

	describe("searchProfiles", () => {
		it("defaults to active, scoped to the Actor's org", async () => {
			await seed([
				{ id: "a", firstName: "Asha" },
				{ id: "b", firstName: "Bina", status: "draft" },
				{ id: "c", firstName: "Chitra", status: "inactive" },
				{ id: "x", firstName: "Xena", organizationId: "o2" },
			]);
			const res = await searchProfiles(db, ACTOR, {});
			expect(res.items.map((i) => i.id)).toEqual(["a"]);
			expect(res.nextCursor).toBeNull();
		});

		it("status filter overrides the default", async () => {
			await seed([
				{ id: "a", firstName: "Asha" },
				{ id: "b", firstName: "Bina", status: "draft" },
			]);
			const res = await searchProfiles(db, ACTOR, { status: "draft" });
			expect(res.items.map((i) => i.id)).toEqual(["b"]);
		});

		it("gender filter", async () => {
			await seed([
				{ id: "a", firstName: "Asha", gender: "female" },
				{ id: "b", firstName: "Bhavin", gender: "male" },
				{ id: "c", firstName: "Chet" },
			]);
			const res = await searchProfiles(db, ACTOR, { gender: "female" });
			expect(res.items.map((i) => i.id)).toEqual(["a"]);
		});

		it("item shape: id, fullName, nickName, gender, status", async () => {
			await seed([
				{
					id: "a",
					firstName: "Asha",
					middleName: "K",
					lastName: "Patel",
					nickName: "Ash",
					gender: "female",
					email: "secret@x.test",
				},
			]);
			const { items } = await searchProfiles(db, ACTOR, {});
			expect(items).toEqual([
				{ id: "a", fullName: "Asha K Patel", nickName: "Ash", gender: "female", status: "active" },
			]);
		});

		it("query: every token must match a name part, case-insensitive", async () => {
			await seed([
				{ id: "a", firstName: "Jared", lastName: "Smith" },
				{ id: "b", firstName: "Jared", lastName: "Jones" },
				{ id: "c", firstName: "Maya", lastName: "Smith", nickName: "Jay" },
			]);
			const ids = async (query: string) =>
				(await searchProfiles(db, ACTOR, { query })).items.map((i) => i.id).sort();
			expect(await ids("jared smith")).toEqual(["a"]);
			expect(await ids("Smith")).toEqual(["a", "c"]);
			expect(await ids("jay")).toEqual(["c"]);
			expect(await ids("   ")).toEqual(["a", "b", "c"]);
		});

		it("query treats % and _ literally", async () => {
			await seed([
				{ id: "a", firstName: "Asha" },
				{ id: "b", firstName: "A_sha" },
			]);
			const res = await searchProfiles(db, ACTOR, { query: "%" });
			expect(res.items).toEqual([]);
			const res2 = await searchProfiles(db, ACTOR, { query: "a_s" });
			expect(res2.items.map((i) => i.id)).toEqual(["b"]);
		});

		it("pages with cursor: no gaps, no repeats, last page has null cursor", async () => {
			await seed(["a", "b", "c", "d", "e"].map((id) => ({ id, firstName: id.toUpperCase() })));
			const p1 = await searchProfiles(db, ACTOR, { limit: 2 });
			expect(p1.items.map((i) => i.id)).toEqual(["a", "b"]);
			expect(p1.nextCursor).toBeTruthy();
			const p2 = await searchProfiles(db, ACTOR, { limit: 2, cursor: p1.nextCursor! });
			expect(p2.items.map((i) => i.id)).toEqual(["c", "d"]);
			const p3 = await searchProfiles(db, ACTOR, { limit: 2, cursor: p2.nextCursor! });
			expect(p3.items.map((i) => i.id)).toEqual(["e"]);
			expect(p3.nextCursor).toBeNull();
		});

		it("exact page boundary → null cursor", async () => {
			await seed([
				{ id: "a", firstName: "A" },
				{ id: "b", firstName: "B" },
			]);
			expect((await searchProfiles(db, ACTOR, { limit: 2 })).nextCursor).toBeNull();
		});

		it("limit defaults to 25 and clamps to 1..100", async () => {
			await seed(
				Array.from({ length: 120 }, (_, i) => ({
					id: `p${String(i).padStart(3, "0")}`,
					firstName: "N",
				}))
			);
			expect((await searchProfiles(db, ACTOR, {})).items).toHaveLength(25);
			expect((await searchProfiles(db, ACTOR, { limit: 1000 })).items).toHaveLength(100);
			expect((await searchProfiles(db, ACTOR, { limit: 0 })).items).toHaveLength(1);
		});
	});

	describe("listCommunityMembers (members page)", () => {
		it("org scoped, filters, page offset and total", async () => {
			await seed([
				{ id: "a", firstName: "Asha", gender: "female" },
				{ id: "b", firstName: "Bina", gender: "female", status: "draft" },
				{ id: "c", firstName: "Chet", gender: "male" },
				{ id: "x", firstName: "Xena", organizationId: "o2" },
			]);
			const base = { search: "", status: "", gender: "", page: 1, pageSize: 10 } as const;
			const all = await listCommunityMembers(db, ACTOR, base);
			expect(all.total).toBe(3);
			expect(all.data.map((d) => d.id).sort()).toEqual(["a", "b", "c"]);
			expect(all.data[0]).toHaveProperty("email");

			const f = await listCommunityMembers(db, ACTOR, {
				...base,
				gender: "female",
				status: "draft",
			});
			expect(f.data.map((d) => d.id)).toEqual(["b"]);
			expect(f.total).toBe(1);

			const paged = await listCommunityMembers(db, ACTOR, { ...base, page: 2, pageSize: 2 });
			expect(paged.data).toHaveLength(1);
			expect(paged.total).toBe(3);
			expect(paged.page).toBe(2);
		});

		it("search matches first/last/email", async () => {
			await seed([
				{ id: "a", firstName: "Asha", email: "asha@x.test" },
				{ id: "b", firstName: "Bina", lastName: "Ashar" },
			]);
			const base = { status: "", gender: "", page: 1, pageSize: 10 } as const;
			const res = await listCommunityMembers(db, ACTOR, { ...base, search: "ash" });
			expect(res.data.map((d) => d.id).sort()).toEqual(["a", "b"]);
		});
	});

	describe("getCommunityProfileDetail", () => {
		it("cross-org id → NotFound", async () => {
			await seed([{ id: "x", firstName: "Xena", organizationId: "o2" }]);
			await expect(getCommunityProfileDetail(db, ACTOR, "x")).rejects.toMatchObject({
				name: "AppError",
				kind: "NotFound",
			});
		});

		it("unknown id → NotFound", async () => {
			await expect(getCommunityProfileDetail(db, ACTOR, "nope")).rejects.toMatchObject({
				kind: "NotFound",
			});
		});

		it("returns profile minus org id", async () => {
			await seed([{ id: "a", firstName: "Asha" }]);
			const res = await getCommunityProfileDetail(db, ACTOR, "a");
			expect(res.profile.id).toBe("a");
			expect(res.profile).not.toHaveProperty("organizationId");
			expect(res).toMatchObject({
				addresses: [],
				customFieldDefs: [],
				outgoingRelations: [],
				incomingRelations: [],
			});
		});
	});
});
