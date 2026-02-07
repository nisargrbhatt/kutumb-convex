import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import {
	COMMUNITY_ADDRESS_TYPE,
	COMMUNITY_PROFILE_BLOOD_GROUP,
	COMMUNITY_PROFILE_RELATIONSHIP,
	COMMUNITY_PROFILE_STATUS,
	COMMUNITY_RELATION_TYPE,
	CUSTOM_FIELD_TYPE,
	GENDERS,
	ORGANIZATION_ROLES,
} from "./constants";
import { user } from "./auth-schema";
import { relations } from "drizzle-orm";
export * from "./auth-schema";

export type PrimaryKey<T extends string> = string & { __brand: T };

export const profile = sqliteTable("profile", {
	id: text("id").primaryKey().$type<PrimaryKey<"profile">>().primaryKey(),
	displayName: text("displayName").notNull(),
	email: text("email").notNull(),
	userId: text("userId")
		.references(() => user.id, {
			onDelete: "cascade",
		})
		.notNull(),
});

export const profileRelations = relations(profile, ({ many, one }) => ({
	profileOwner: one(user, {
		fields: [profile.id],
		references: [user.id],
	}),
	organizationMembers: many(organizationMember),
}));

export const organization = sqliteTable("organization", {
	id: text("id").primaryKey().$type<PrimaryKey<"organization">>(),
	name: text("name").notNull(),
	description: text("description").notNull(),
	slug: text("slug").notNull().unique(),
	subscriptionId: text("subscriptionId").notNull(),
	customerId: text("customerId").notNull(),
});

export const organizationRelations = relations(organization, ({ many }) => ({
	members: many(organizationMember),
	relations: many(communityRelation),
	memories: many(communityMemory),
	customFields: many(communityProfileCustomField),
}));

export const organizationMember = sqliteTable("organizationMember", {
	id: text("id").primaryKey().$type<PrimaryKey<"organizationMember">>(),
	organizationId: text("organizationId")
		.$type<PrimaryKey<"organization">>()
		.references(() => organization.id, {
			onDelete: "cascade",
		})
		.notNull(),
	memberId: text("memberId")
		.$type<PrimaryKey<"profile">>()
		.references(() => profile.id, {
			onDelete: "cascade",
		})
		.notNull(),
	role: text("role", {
		mode: "text",
		enum: [ORGANIZATION_ROLES.owner, ORGANIZATION_ROLES.manager, ORGANIZATION_ROLES.member],
	})
		.notNull()
		.default(ORGANIZATION_ROLES.member),
});

export const organizationMemberRelations = relations(organizationMember, ({ one }) => ({
	organization: one(organization, {
		fields: [organizationMember.organizationId],
		references: [organization.id],
	}),
	member: one(profile, {
		fields: [organizationMember.memberId],
		references: [profile.id],
	}),
}));

export const communityProfileCustomField = sqliteTable("communityProfileCustomField", {
	id: text("id").primaryKey().$type<PrimaryKey<"communityProfileCustomField">>(),
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
		.$type<PrimaryKey<"organization">>()
		.references(() => organization.id, {
			onDelete: "cascade",
		})
		.notNull(),
});

export const communityProfile = sqliteTable("communityProfile", {
	id: text("id").primaryKey().$type<PrimaryKey<"communityProfile">>(),
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
	gotra: text("gotra"),
	native: text("native"),
	maternal: text("maternal"),
	birthPlace: text("birthPlace"),
	relationship: text("relationship", {
		mode: "text",
		enum: [
			COMMUNITY_PROFILE_RELATIONSHIP.single,
			COMMUNITY_PROFILE_RELATIONSHIP.married,
			COMMUNITY_PROFILE_RELATIONSHIP.divorced,
			COMMUNITY_PROFILE_RELATIONSHIP.widowed,
			COMMUNITY_PROFILE_RELATIONSHIP["rather not say"],
		],
	}),
	comment: text("comment"),
	profileId: text("profileId")
		.$type<PrimaryKey<"profile">>()
		.references(() => profile.id, {
			onDelete: "cascade",
		}),
	organizationId: text("organizationId")
		.$type<PrimaryKey<"organization">>()
		.references(() => organization.id, {
			onDelete: "cascade",
		})
		.notNull(),
});

export const communityProfileRelations = relations(communityProfile, ({ one, many }) => ({
	profile: one(profile, {
		fields: [communityProfile.profileId],
		references: [profile.id],
	}),
	organization: one(organization, {
		fields: [communityProfile.organizationId],
		references: [organization.id],
	}),
	addresses: many(communityAddress),
}));

export const communityAddress = sqliteTable("communityAddress", {
	id: text("id").primaryKey().$type<PrimaryKey<"communityAddress">>(),
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
	communityProfileId: text("communityProfileId")
		.$type<PrimaryKey<"communityProfile">>()
		.references(() => communityProfile.id, {
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
	id: text("id").primaryKey().$type<PrimaryKey<"communityRelation">>(),
	fromId: text("fromId")
		.$type<PrimaryKey<"communityProfile">>()
		.references(() => communityProfile.id, {
			onDelete: "cascade",
		}),
	toId: text("toId")
		.$type<PrimaryKey<"communityProfile">>()
		.references(() => communityProfile.id, {
			onDelete: "cascade",
		}),
	organizationId: text("organizationId")
		.$type<PrimaryKey<"organization">>()
		.references(() => organization.id, {
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
	id: text("id").primaryKey().$type<PrimaryKey<"communityMemory">>(),
	createdBy: text("createdBy")
		.$type<PrimaryKey<"communityProfile">>()
		.references(() => communityProfile.id, {
			onDelete: "cascade",
		}),
	organizationId: text("organizationId")
		.$type<PrimaryKey<"organization">>()
		.references(() => organization.id, {
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
