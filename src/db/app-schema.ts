import { integer, sqliteTable, text, blob } from "drizzle-orm/sqlite-core";
import {
	COMMUNITY_ADDRESS_TYPE,
	COMMUNITY_PROFILE_BLOOD_GROUP,
	COMMUNITY_PROFILE_STATUS,
	COMMUNITY_RELATION_TYPE,
	CUSTOM_FIELD_TYPE,
	GENDERS,
} from "./constants";
import { relations } from "drizzle-orm";
import { organization, user } from "./auth-schema";

export const communityProfileCustomField = sqliteTable("communityProfileCustomField", {
	id: text("id").primaryKey(),
	label: text("label").notNull(),
	type: text("type", {
		mode: "text",
		enum: [
			CUSTOM_FIELD_TYPE.text,
			CUSTOM_FIELD_TYPE.number,
			CUSTOM_FIELD_TYPE.date,
			CUSTOM_FIELD_TYPE.boolean,
		],
	})
		.notNull()
		.default(CUSTOM_FIELD_TYPE.text),
	organizationId: text("organizationId")
		.references(() => organization.id, {
			onDelete: "cascade",
		})
		.notNull(),
});

export const communityProfile = sqliteTable("communityProfile", {
	id: text("id").primaryKey(),
	firstName: text("firstName").notNull(),
	middleName: text("middleName"),
	lastName: text("lastName").notNull(),
	nickName: text("nickName"),
	gender: text("gender", {
		mode: "text",
		enum: [GENDERS.male, GENDERS.female, GENDERS.other],
	}),
	email: text("email"),
	status: text("status", {
		mode: "text",
		enum: [
			COMMUNITY_PROFILE_STATUS.active,
			COMMUNITY_PROFILE_STATUS.inactive,
			COMMUNITY_PROFILE_STATUS.draft,
		],
	}).notNull(),
	bloodGroup: text("bloodGroup", {
		mode: "text",
		enum: [
			COMMUNITY_PROFILE_BLOOD_GROUP["A+"],
			COMMUNITY_PROFILE_BLOOD_GROUP["A-"],
			COMMUNITY_PROFILE_BLOOD_GROUP["B+"],
			COMMUNITY_PROFILE_BLOOD_GROUP["B-"],
			COMMUNITY_PROFILE_BLOOD_GROUP["AB+"],
			COMMUNITY_PROFILE_BLOOD_GROUP["AB-"],
			COMMUNITY_PROFILE_BLOOD_GROUP["O+"],
			COMMUNITY_PROFILE_BLOOD_GROUP["O-"],
		],
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
});

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
		enum: [COMMUNITY_ADDRESS_TYPE.home, COMMUNITY_ADDRESS_TYPE.work, COMMUNITY_ADDRESS_TYPE.other],
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

export const communityRelation = sqliteTable("communityRelation", {
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
		enum: [
			COMMUNITY_RELATION_TYPE.brother,
			COMMUNITY_RELATION_TYPE.brother_in_law,
			COMMUNITY_RELATION_TYPE.child,
			COMMUNITY_RELATION_TYPE.father,
			COMMUNITY_RELATION_TYPE.father_in_law,
			COMMUNITY_RELATION_TYPE.mother,
			COMMUNITY_RELATION_TYPE.mother_in_law,
			COMMUNITY_RELATION_TYPE.sister,
			COMMUNITY_RELATION_TYPE.sister_in_law,
			COMMUNITY_RELATION_TYPE.wife,
			COMMUNITY_RELATION_TYPE.husband,
			COMMUNITY_RELATION_TYPE.uncle,
			COMMUNITY_RELATION_TYPE.aunt,
		],
	}),
	note: text("note"),
	bloodRelation: integer({ mode: "boolean" }).default(false),
});

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
