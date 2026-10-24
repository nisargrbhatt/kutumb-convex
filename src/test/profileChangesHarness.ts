import { vi, type Mock } from "vitest";
import { asc } from "drizzle-orm";
import { auditEvent, communityProfile } from "@/db/schema";
import type { CommunityProfileInput } from "@/domain/communityProfile";
import type { Actor, Role } from "@/domain/permission";
import { makeProfileChanges, type AddressInput, type Via } from "@/domain/profileChanges";
import { freshDb } from "./sqliteDb";

export const actor = (role: Role, userId = `u-${role}`): Actor => ({
	userId,
	organizationId: "o1",
	role,
});
export const OWNER = actor("owner");
export const ADMIN = actor("admin");
export const MEMBER = actor("member");
export const OTHER = actor("member", "u-other");

export const input = (over: Partial<CommunityProfileInput> = {}): CommunityProfileInput => ({
	firstName: "Asha",
	middleName: null,
	lastName: "Patel",
	nickName: null,
	gender: "female",
	email: null,
	bloodGroup: null,
	mobileNumber: null,
	dateOfBirth: null,
	dateOfDeath: null,
	customFieldData: null,
	...over,
});

export const address: AddressInput = {
	line1: "1 Main St",
	line2: null,
	country: "IN",
	state: "GJ",
	city: "Surat",
	postalCode: "395001",
	type: "home",
	note: null,
	digipin: null,
};

/** In-memory org `o1` with owner/admin/member/other users, a seam on a fresh db, spies. */
export function profileChangesHarness() {
	const fresh = freshDb();
	const { db } = fresh;
	fresh.sqlite.exec(`
		INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES
			('u-owner', 'Olga Owner', 'o@x.test', 1, 0, 0),
			('u-admin', 'Adi Admin', 'a@x.test', 1, 0, 0),
			('u-member', 'Mira Member', 'm@x.test', 1, 0, 0),
			('u-other', 'Otto Other', 'x@x.test', 1, 0, 0);
		INSERT INTO organization (id, name, slug, created_at) VALUES ('o1', 'Org 1', 'o1', 0);
		INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES
			('m1', 'o1', 'u-owner', 'owner', 0),
			('m2', 'o1', 'u-admin', 'admin', 0),
			('m3', 'o1', 'u-member', 'member', 0),
			('m4', 'o1', 'u-other', 'member', 0);
	`);
	const onGraphChanged: Mock<(organizationId: string) => void> = vi.fn();
	let t = 1000;
	let n = 0;
	const now = () => new Date(t++);
	const seamDeps = {
		db,
		limits: { assertProfileSlot: async () => {} },
		onGraphChanged,
		now,
		newId: () => `id${++n}`,
	};
	const changes = makeProfileChanges(seamDeps);

	type Seed = Partial<typeof communityProfile.$inferInsert> & { id: string };
	return {
		fresh,
		db,
		changes,
		/** Same seam, as seen through an AI Client Connection. */
		changesVia: (via: Via) => makeProfileChanges({ ...seamDeps, via }),
		onGraphChanged,
		now,
		events: () =>
			db.select().from(auditEvent).orderBy(asc(auditEvent.createdAt), asc(auditEvent.id)),
		profile: (id: string) =>
			db.query.communityProfile.findFirst({ where: (f, o) => o.eq(f.id, id) }),
		request: (id: string) => db.query.changeRequest.findFirst({ where: (f, o) => o.eq(f.id, id) }),
		seed: (...rows: Seed[]) =>
			db.insert(communityProfile).values(
				rows.map((r) => ({
					firstName: r.id.toUpperCase(),
					lastName: "Doe",
					status: "active" as const,
					organizationId: "o1",
					...r,
				}))
			),
		/** Runs `sql` right before the next batch (a concurrent write landing mid-Review). */
		beforeNextBatch(sql: string) {
			const realBatch = db.batch.bind(db);
			db.batch = (async (items: never) => {
				db.batch = realBatch;
				fresh.sqlite.exec(sql);
				return realBatch(items);
			}) as typeof db.batch;
		},
	};
}
