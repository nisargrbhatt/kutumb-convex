import { beforeEach, describe, expect, it, vi } from "vitest";
import { freshDb } from "@/test/sqliteDb";
import { isAppError } from "./errors";
import { CUSTOM_FIELD_LIMIT, LIMIT_ERROR_CODES } from "./limits";
import { addCustomFieldDefinition, listCustomFieldDefinitions } from "./customFieldDefinitions";

let fresh: ReturnType<typeof freshDb>;
let n = 0;
const newId = () => `id${++n}`;

beforeEach(() => {
	n = 0;
	fresh = freshDb();
	fresh.sqlite.exec(`
		INSERT INTO organization (id, name, slug, created_at) VALUES ('o1', 'Org 1', 'o1', 0), ('o2', 'Org 2', 'o2', 0);
	`);
});

const add = (label: string, org = "o1", type: "text" | "number" = "text") =>
	addCustomFieldDefinition(fresh.db, org, { label, type }, { newId });

const failure = async (p: Promise<unknown>) => {
	try {
		await p;
	} catch (e) {
		return e;
	}
	throw new Error("expected rejection");
};

describe("addCustomFieldDefinition", () => {
	it("adds a definition and lists them in insertion order", async () => {
		await add("Gotra");
		await add("Height", "o1", "number");
		await add("Other org", "o2");
		expect(await listCustomFieldDefinitions(fresh.db, "o1")).toEqual([
			{ id: "id1", label: "Gotra", type: "text" },
			{ id: "id2", label: "Height", type: "number" },
		]);
	});

	it("rejects a duplicate label (case-insensitive, trimmed) as Invalid", async () => {
		await add("Gotra");
		const e = await failure(add("  gOTRA "));
		expect(isAppError(e) && e.kind).toBe("Invalid");
		expect((e as Error).message).toContain("Gotra");
		expect(await listCustomFieldDefinitions(fresh.db, "o1")).toHaveLength(1);
	});

	it("allows the same label in another org", async () => {
		await add("Gotra");
		await add("Gotra", "o2");
		expect(await listCustomFieldDefinitions(fresh.db, "o2")).toHaveLength(1);
	});

	it("stores the trimmed label", async () => {
		await add("  Gotra  ");
		expect((await listCustomFieldDefinitions(fresh.db, "o1"))[0]!.label).toBe("Gotra");
	});

	it("allows the 50th definition, rejects the 51st with the field-limit code", async () => {
		for (let i = 1; i <= CUSTOM_FIELD_LIMIT; i++) await add(`Field ${i}`);
		const onReached = vi.fn();
		const e = await failure(
			addCustomFieldDefinition(
				fresh.db,
				"o1",
				{ label: "One more", type: "text" },
				{ newId, onLimitReached: onReached }
			)
		);
		expect(isAppError(e) && [e.kind, e.code]).toEqual([
			"LimitReached",
			LIMIT_ERROR_CODES.customField,
		]);
		expect(onReached).toHaveBeenCalledWith({ limit: "customField", organizationId: "o1" });
		expect(await listCustomFieldDefinitions(fresh.db, "o1")).toHaveLength(CUSTOM_FIELD_LIMIT);
		// Another org is unaffected.
		await add("Fine", "o2");
	});

	it("legacy duplicates already stored don't block listing", async () => {
		fresh.sqlite
			.exec(`INSERT INTO communityProfileCustomField (id, label, type, organizationId) VALUES
			('a', 'Dup', 'text', 'o1'), ('b', 'dup', 'text', 'o1');`);
		expect((await listCustomFieldDefinitions(fresh.db, "o1")).map((d) => d.id)).toEqual(["a", "b"]);
	});
});
