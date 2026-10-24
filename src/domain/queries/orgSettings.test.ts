import { beforeEach, describe, expect, it } from "vitest";
import { freshDb } from "@/test/sqliteDb";
import type { Actor } from "@/domain/permission";
import { getAiClientWrites, setAiClientWrites } from "./orgSettings";

const OWNER: Actor = { userId: "u-owner", organizationId: "o1", role: "owner" };
const ADMIN: Actor = { userId: "u-admin", organizationId: "o1", role: "admin" };
const MEMBER: Actor = { userId: "u-member", organizationId: "o1", role: "member" };

describe("AI Client writes toggle (org setting)", () => {
	let db: ReturnType<typeof freshDb>["db"];

	beforeEach(() => {
		const fresh = freshDb();
		db = fresh.db;
		fresh.sqlite.exec(
			"INSERT INTO organization (id, name, slug, created_at) VALUES ('o1', 'Org 1', 'o1', 0), ('o2', 'Org 2', 'o2', 0)"
		);
	});

	it("defaults to on (no row)", async () => {
		await expect(getAiClientWrites(db, "o1")).resolves.toBe(true);
	});

	it("owner can turn it off and on again", async () => {
		await setAiClientWrites(db, OWNER, false);
		await expect(getAiClientWrites(db, "o1")).resolves.toBe(false);
		await setAiClientWrites(db, OWNER, true);
		await expect(getAiClientWrites(db, "o1")).resolves.toBe(true);
	});

	it("is per organization", async () => {
		await setAiClientWrites(db, OWNER, false);
		await expect(getAiClientWrites(db, "o2")).resolves.toBe(true);
	});

	it.each([ADMIN, MEMBER])("rejects a $role", async (actor) => {
		await expect(setAiClientWrites(db, actor, false)).rejects.toMatchObject({
			name: "AppError",
			kind: "Forbidden",
		});
		await expect(getAiClientWrites(db, "o1")).resolves.toBe(true);
	});
});
