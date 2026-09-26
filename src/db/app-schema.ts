import { integer, sqliteTable, text, blob, index } from "drizzle-orm/sqlite-core";
import {
	COMMUNITY_ADDRESS_TYPE,
	COMMUNITY_PROFILE_BLOOD_GROUP,
	COMMUNITY_PROFILE_STATUS,
	COMMUNITY_RELATION_TYPE,
	CUSTOM_FIELD_TYPE,
	GENDERS,
	enumValues,
} from "./constants";
import { relations } from "drizzle-orm";
import { organization, user } from "./auth-schema";

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
		customFieldData: blob({ mode: "json" }).$type<Record<string, any>>(),
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
