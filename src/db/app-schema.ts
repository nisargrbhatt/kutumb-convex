import { integer, sqliteTable, text, blob, index } from "drizzle-orm/sqlite-core";
import {
	AUDIT_ACTION,
	CHANGE_REQUEST_KIND,
	CHANGE_REQUEST_STATUS,
	COMMUNITY_ADDRESS_TYPE,
	COMMUNITY_PROFILE_BLOOD_GROUP,
	COMMUNITY_PROFILE_STATUS,
	COMMUNITY_RELATION_TYPE,
	CUSTOM_FIELD_TYPE,
	GENDERS,
	ORGANIZATION_ROLES,
	enumValues,
} from "./constants";
import { relations } from "drizzle-orm";
import { organization, user } from "./auth-schema";
import type { CustomFieldValues } from "@/domain/customFields";

export const communityProfileCustomField = sqliteTable("communityProfileCustomField", {
	id: text("id").primaryKey(),
	label: text("label").notNull(),
	type: text("type", {
		mode: "text",
		enum: enumValues(CUSTOM_FIELD_TYPE),
	})
		.notNull()
		.default(CUSTOM_FIELD_TYPE.text),
	organizationId: text("organizationId")
		.references(() => organization.id, {
			onDelete: "cascade",
		})
		.notNull(),
});

export const communityProfile = sqliteTable(
	"communityProfile",
	{
		id: text("id").primaryKey(),
		firstName: text("firstName").notNull(),
		middleName: text("middleName"),
		lastName: text("lastName").notNull(),
		nickName: text("nickName"),
		gender: text("gender", {
			mode: "text",
			enum: enumValues(GENDERS),
		}),
		email: text("email"),
		status: text("status", {
			mode: "text",
			enum: enumValues(COMMUNITY_PROFILE_STATUS),
		}).notNull(),
		bloodGroup: text("bloodGroup", {
			mode: "text",
			enum: enumValues(COMMUNITY_PROFILE_BLOOD_GROUP),
		}),
		mobileNumber: text("mobileNumber"),
		dateOfBirth: text("dateOfBirth"),
		dateOfDeath: text("dateOfDeath"),
		comment: text("comment"),
		userId: text("userId").references(() => user.id, {
			onDelete: "cascade",
		}),
		organizationId: text("organizationId")
			.references(() => organization.id, {
				onDelete: "cascade",
			})
			.notNull(),
		customFieldData: blob({ mode: "json" }).$type<CustomFieldValues>(),
		/** Optimistic-concurrency counter, bumped on every write. */
		version: integer("version").notNull().default(0),
	},
	(table) => [index("communityProfile_org_status_idx").on(table.organizationId, table.status)]
);

export const communityProfileRelations = relations(communityProfile, ({ one, many }) => ({
	user: one(user, {
		fields: [communityProfile.userId],
		references: [user.id],
	}),
	organization: one(organization, {
		fields: [communityProfile.organizationId],
		references: [organization.id],
	}),
	addresses: many(communityAddress),
}));

export const communityAddress = sqliteTable("communityAddress", {
	id: text("id").primaryKey(),
	line1: text("line1").notNull(),
	line2: text("line2"),
	country: text("country").notNull(),
	state: text("state").notNull(),
	city: text("city").notNull(),
	postalCode: text("postalCode").notNull(),
	type: text("type", {
		mode: "text",
		enum: enumValues(COMMUNITY_ADDRESS_TYPE),
	}),
	note: text("note"),
	digipin: text("digipin"),
	communityProfileId: text("communityProfileId").references(() => communityProfile.id, {
		onDelete: "cascade",
	}),
	/** Optimistic-concurrency counter, bumped on every write. */
	version: integer("version").notNull().default(0),
});

export const communityAddressRelations = relations(communityAddress, ({ one }) => ({
	communityProfile: one(communityProfile, {
		fields: [communityAddress.communityProfileId],
		references: [communityProfile.id],
	}),
}));

export const communityRelation = sqliteTable(
	"communityRelation",
	{
		id: text("id").primaryKey(),
		fromId: text("fromId").references(() => communityProfile.id, {
			onDelete: "cascade",
		}),
		toId: text("toId").references(() => communityProfile.id, {
			onDelete: "cascade",
		}),
		organizationId: text("organizationId").references(() => organization.id, {
			onDelete: "cascade",
		}),
		type: text("type", {
			mode: "text",
			enum: enumValues(COMMUNITY_RELATION_TYPE),
		}),
		note: text("note"),
		bloodRelation: integer({ mode: "boolean" }).default(false),
	},
	(table) => [
		index("communityRelation_org_from_idx").on(table.organizationId, table.fromId),
		index("communityRelation_org_to_idx").on(table.organizationId, table.toId),
	]
);

export const communityRelationRelations = relations(communityRelation, ({ one }) => ({
	fromCommunityProfile: one(communityProfile, {
		fields: [communityRelation.fromId],
		references: [communityProfile.id],
	}),
	toCommunityProfile: one(communityProfile, {
		fields: [communityRelation.toId],
		references: [communityProfile.id],
	}),
	organization: one(organization, {
		fields: [communityRelation.organizationId],
		references: [organization.id],
	}),
}));

export const communityMemory = sqliteTable("communityMemory", {
	id: text("id").primaryKey(),
	createdBy: text("createdBy").references(() => communityProfile.id, {
		onDelete: "cascade",
	}),
	organizationId: text("organizationId").references(() => organization.id, {
		onDelete: "cascade",
	}),
	content: text("content").notNull(),
});

export const communityMemoryRelations = relations(communityMemory, ({ one }) => ({
	communityProfile: one(communityProfile, {
		fields: [communityMemory.createdBy],
		references: [communityProfile.id],
	}),
	organization: one(organization, {
		fields: [communityMemory.organizationId],
		references: [organization.id],
	}),
}));

// Change Request: a proposed profile change awaiting Review. FK to org only; profile/user are
// snapshotted so the row survives profile hard-delete (My requests still shows the outcome).
export const changeRequest = sqliteTable(
	"changeRequest",
	{
		id: text("id").primaryKey(),
		organizationId: text("organizationId")
			.references(() => organization.id, { onDelete: "cascade" })
			.notNull(),
		profileId: text("profileId").notNull(),
		profileName: text("profileName").notNull(),
		kind: text("kind", { mode: "text", enum: enumValues(CHANGE_REQUEST_KIND) }).notNull(),
		status: text("status", { mode: "text", enum: enumValues(CHANGE_REQUEST_STATUS) })
			.notNull()
			.default(CHANGE_REQUEST_STATUS.pending),
		/** Relation / address id for relation_remove, address_edit, address_remove. */
		targetId: text("targetId"),
		payload: text("payload", { mode: "json" }).$type<unknown>(),
		submitterUserId: text("submitterUserId"),
		submitterName: text("submitterName").notNull(),
		createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
		resolvedByUserId: text("resolvedByUserId"),
		resolvedByName: text("resolvedByName"),
		resolvedAt: integer("resolvedAt", { mode: "timestamp_ms" }),
		resolutionNote: text("resolutionNote"),
		submitterSeenAt: integer("submitterSeenAt", { mode: "timestamp_ms" }),
	},
	(table) => [
		index("changeRequest_org_status_created_idx").on(
			table.organizationId,
			table.status,
			table.createdAt
		),
		index("changeRequest_org_submitter_created_idx").on(
			table.organizationId,
			table.submitterUserId,
			table.createdAt
		),
		index("changeRequest_profile_status_idx").on(table.profileId, table.status),
	]
);

// Audit Event: append-only record of a profile change or Review. FK to org only.
export const auditEvent = sqliteTable(
	"auditEvent",
	{
		id: text("id").primaryKey(),
		organizationId: text("organizationId")
			.references(() => organization.id, { onDelete: "cascade" })
			.notNull(),
		action: text("action", { mode: "text", enum: enumValues(AUDIT_ACTION) }).notNull(),
		createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
		actorUserId: text("actorUserId").notNull(),
		actorName: text("actorName").notNull(),
		actorRole: text("actorRole", { mode: "text", enum: enumValues(ORGANIZATION_ROLES) }).notNull(),
		profileId: text("profileId").notNull(),
		profileName: text("profileName").notNull(),
		counterpartProfileId: text("counterpartProfileId"),
		counterpartName: text("counterpartName"),
		targetId: text("targetId"),
		changeRequestId: text("changeRequestId"),
		payload: text("payload", { mode: "json" }).$type<unknown>(),
	},
	(table) => [
		index("auditEvent_org_created_idx").on(table.organizationId, table.createdAt),
		index("auditEvent_org_profile_created_idx").on(
			table.organizationId,
			table.profileId,
			table.createdAt
		),
		index("auditEvent_org_counterpart_created_idx").on(
			table.organizationId,
			table.counterpartProfileId,
			table.createdAt
		),
		index("auditEvent_org_actor_created_idx").on(
			table.organizationId,
			table.actorUserId,
			table.createdAt
		),
	]
);

// better-auth rate limiter state. Written only by `createD1RateLimitStorage`
// (src/lib/rate-limit-d1.ts), never through the better-auth adapter.
export const rateLimit = sqliteTable(
	"rate_limit",
	{
		key: text("key").primaryKey(),
		count: integer("count").notNull(),
		lastRequest: integer("last_request").notNull(),
	},
	(table) => [index("rate_limit_lastRequest_idx").on(table.lastRequest)]
);

// Per-org switches. Missing row = defaults (AI Client writes on). ADR 0006.
export const orgSetting = sqliteTable("orgSetting", {
	organizationId: text("organizationId")
		.primaryKey()
		.references(() => organization.id, { onDelete: "cascade" }),
	aiClientWrites: integer("aiClientWrites", { mode: "boolean" }).notNull().default(true),
});
