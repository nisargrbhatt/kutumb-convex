import { describe, expect, it } from "vitest";
import {
	blobKey,
	blobUrl,
	canAttach,
	formatBytes,
	isAllowedVariant,
	missingVariants,
	parseBlobPath,
	PENDING_TTL_MS,
	variantMaxEdge,
} from "./blob";

describe("formatBytes", () => {
	it("shows storage in decimal units, one decimal under 100", () => {
		expect(formatBytes(0)).toBe("0 B");
		expect(formatBytes(999)).toBe("999 B");
		expect(formatBytes(1_000)).toBe("1.0 KB");
		expect(formatBytes(12_345_678)).toBe("12.3 MB");
		expect(formatBytes(123_456_789)).toBe("123 MB");
		expect(formatBytes(999_999)).toBe("1.0 MB");
		expect(formatBytes(2_500_000_000)).toBe("2.5 GB");
		expect(formatBytes(3_000_000_000_000)).toBe("3,000 GB");
	});
});

describe("variants per mediaKind", () => {
	it("profilePhoto needs avatar + display, memoryImage thumb + display, memoryVideo video", () => {
		expect(missingVariants("profilePhoto", {})).toEqual(["avatar", "display"]);
		expect(missingVariants("memoryImage", { display: 1 })).toEqual(["thumb"]);
		expect(missingVariants("memoryVideo", {})).toEqual(["video"]);
		expect(missingVariants("memoryVideo", { video: 9 })).toEqual([]);
	});

	it("allows only the kind's variants; poster is optional on video", () => {
		expect(isAllowedVariant("profilePhoto", "avatar")).toBe(true);
		expect(isAllowedVariant("profilePhoto", "thumb")).toBe(false);
		expect(isAllowedVariant("memoryImage", "avatar")).toBe(false);
		expect(isAllowedVariant("memoryVideo", "poster")).toBe(true);
		expect(isAllowedVariant("memoryVideo", "nope")).toBe(false);
	});

	it("caps longest edge per variant", () => {
		expect(variantMaxEdge("profilePhoto", "avatar")).toBe(128);
		expect(variantMaxEdge("profilePhoto", "display")).toBe(1024);
		expect(variantMaxEdge("memoryImage", "thumb")).toBe(640);
		expect(variantMaxEdge("memoryImage", "display")).toBe(2048);
		expect(variantMaxEdge("memoryVideo", "poster")).toBe(1280);
	});
});

describe("blob url", () => {
	it("builds a stable url from org + blob id, round-trips through parse", () => {
		expect(blobUrl("o1", "b1", "avatar")).toBe("/api/blob/o1/b1/avatar");
		expect(blobUrl("o1", "b1", "display", { download: true })).toBe(
			"/api/blob/o1/b1/display?download=1"
		);
		expect(blobKey("o1", "b1", "avatar")).toBe("o1/b1/avatar");
		expect(parseBlobPath("/api/blob/o1/b1/avatar")).toEqual({
			organizationId: "o1",
			blobId: "b1",
			variant: "avatar",
		});
	});

	it("parse rejects unknown variants and malformed paths", () => {
		expect(parseBlobPath("/api/blob/o1/b1/original")).toBeNull();
		expect(parseBlobPath("/api/blob/o1/b1")).toBeNull();
		expect(parseBlobPath("/api/blob/o1/b1/avatar/x")).toBeNull();
		expect(parseBlobPath("/api/blob//b1/avatar")).toBeNull();
		expect(parseBlobPath("/api/blob/o%2F1/b1/avatar")).toBeNull();
	});
});

describe("canAttach", () => {
	const actor = { userId: "u1", organizationId: "o1", role: "member" as const };
	const now = new Date(1_000_000_000);
	const row = {
		organizationId: "o1",
		mediaKind: "profilePhoto" as const,
		status: "pending" as const,
		uploadedByUserId: "u1",
		variants: { avatar: 10, display: 20 },
		createdAt: new Date(now.getTime() - 1000),
	};

	it("accepts the Actor's own pending upload of the right kind with every required variant", () => {
		expect(canAttach(row, { actor, mediaKind: "profilePhoto", now })).toBe(true);
	});

	it.each([
		["not pending", { status: "attached" as const }],
		["other org", { organizationId: "o2" }],
		["someone else's", { uploadedByUserId: "u2" }],
		["wrong kind", { mediaKind: "memoryImage" as const }],
		["missing a variant", { variants: { avatar: 10 } }],
		["expired", { createdAt: new Date(now.getTime() - PENDING_TTL_MS - 1) }],
	])("refuses %s", (_, over) => {
		expect(canAttach({ ...row, ...over }, { actor, mediaKind: "profilePhoto", now })).toBe(false);
	});
});
