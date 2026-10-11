export const GENDERS = {
	male: "male",
	female: "female",
	other: "other",
} as const;

export const ORGANIZATION_ROLES = {
	owner: "owner",
	admin: "admin",
	member: "member",
} as const;

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[keyof typeof ORGANIZATION_ROLES];

export const COMMUNITY_PROFILE_STATUS = {
	active: "active",
	inactive: "inactive",
	draft: "draft",
} as const;

export const COMMUNITY_PROFILE_BLOOD_GROUP = {
	"A+": "A+",
	"A-": "A-",
	"B+": "B+",
	"B-": "B-",
	"AB+": "AB+",
	"AB-": "AB-",
	"O+": "O+",
	"O-": "O-",
} as const;

export const COMMUNITY_PROFILE_RELATIONSHIP = {
	single: "single",
	married: "married",
	divorced: "divorced",
	widowed: "widowed",
	"rather not say": "rather not say",
} as const;

export const COMMUNITY_ADDRESS_TYPE = {
	home: "home",
	work: "work",
	other: "other",
} as const;

export const COMMUNITY_RELATION_TYPE = {
	brother: "brother",
	brother_in_law: "brother_in_law",
	child: "child",
	father: "father",
	father_in_law: "father_in_law",
	mother: "mother",
	mother_in_law: "mother_in_law",
	sister: "sister",
	sister_in_law: "sister_in_law",
	wife: "wife",
	husband: "husband",
	uncle: "uncle",
	aunt: "aunt",
} as const;

export const CUSTOM_FIELD_TYPE = {
	text: "text",
	number: "number",
	date: "date",
	boolean: "boolean",
} as const;

export const CHANGE_REQUEST_KIND = {
	create: "create",
	info: "info",
	relation_add: "relation_add",
	relation_remove: "relation_remove",
	address_add: "address_add",
	address_edit: "address_edit",
	address_remove: "address_remove",
} as const;

export const CHANGE_REQUEST_STATUS = {
	pending: "pending",
	approved: "approved",
	rejected: "rejected",
	withdrawn: "withdrawn",
	superseded: "superseded",
} as const;

export const AUDIT_ACTION = {
	"profile.created": "profile.created",
	"profile.updated": "profile.updated",
	"profile.activated": "profile.activated",
	"profile.deactivated": "profile.deactivated",
	"profile.reactivated": "profile.reactivated",
	"profile.reassigned": "profile.reassigned",
	"profile.deleted": "profile.deleted",
	"relation.added": "relation.added",
	"relation.removed": "relation.removed",
	"address.added": "address.added",
	"address.updated": "address.updated",
	"address.removed": "address.removed",
	"change_request.submitted": "change_request.submitted",
	"change_request.approved": "change_request.approved",
	"change_request.rejected": "change_request.rejected",
	"change_request.withdrawn": "change_request.withdrawn",
	"change_request.superseded": "change_request.superseded",
} as const;

export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];

export const AUDIT_CATEGORY = {
	profile: "profile",
	relation: "relation",
	address: "address",
	request: "request",
} as const;

export type AuditCategory = (typeof AUDIT_CATEGORY)[keyof typeof AUDIT_CATEGORY];

const AUDIT_CATEGORY_PREFIX: Record<AuditCategory, string> = {
	profile: "profile.",
	relation: "relation.",
	address: "address.",
	request: "change_request.",
};

/** Audit Actions in a filter category, for `action IN (...)`. */
export const auditActionsInCategory = (category: AuditCategory): AuditAction[] =>
	Object.values(AUDIT_ACTION).filter((a) => a.startsWith(AUDIT_CATEGORY_PREFIX[category]));

/** Non-empty tuple of an enum-like const's values, for Drizzle `text({ enum })`. */
export const enumValues = <T extends Record<string, string>>(o: T) =>
	Object.values(o) as [T[keyof T], ...T[keyof T][]];
