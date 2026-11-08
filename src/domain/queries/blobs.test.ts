import { describe, expect, it } from "vitest";
import type { BLOB_STATUS } from "@/db/constants";
import { mediaBlob } from "@/db/app-schema";
import { freshDb } from "@/test/sqliteDb";
import { orgAttachedBytes } from "./blobs";

function seed(db: ReturnType<typeof freshDb>["db"]) {
	let n = 0;
	return (organizationId: string, status: keyof typeof BLOB_STATUS, size: number) =>
		db.insert(mediaBlob).values({
			id: `b${++n}`,
			organizationId,
			mediaKind: "memoryImage",
			status,
			uploadedByUserId: "u1",
			size,
			createdAt: new Date(0),
		});
}

describe("orgAttachedBytes", () => {
	it("is zero for an org with no Blobs", async () => {
		const { db } = freshDb();
		expect(await orgAttachedBytes(db, "o1")).toBe(0);
	});

	it("sums attached Blobs of the org only", async () => {
		const { db } = freshDb();
		const add = seed(db);
		await add("o1", "attached", 100);
		await add("o1", "attached", 23);
		await add("o1", "pending", 1000);
		await add("o1", "deleted", 5000);
		await add("o2", "attached", 7);
		expect(await orgAttachedBytes(db, "o1")).toBe(123);
	});
});
