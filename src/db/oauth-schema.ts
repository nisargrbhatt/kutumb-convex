import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { organization, session, user } from "./auth-schema";

// Tables for the `jwt()` + `mcp()` (oauth-provider) plugins. Field names must match the plugin
// schemas (see @better-auth/oauth-provider); arrays + json are stored as JSON text on sqlite.
// Beyond the plugin schema, every `referenceId` (the org picked at consent) is a real FK to
// `organization` so deleting an org cascades its consents and tokens (ADR 0004).

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const jwks = sqliteTable("jwks", {
	id: text("id").primaryKey(),
	publicKey: text("public_key").notNull(),
	privateKey: text("private_key").notNull(),
	createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
	expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
	alg: text("alg"),
	crv: text("crv"),
});

export const oauthClient = sqliteTable(
	"oauth_client",
	{
		id: text("id").primaryKey(),
		clientId: text("client_id").notNull().unique(),
		clientSecret: text("client_secret"),
		clientDiscoveryId: text("client_discovery_id"),
		disabled: integer("disabled", { mode: "boolean" }).default(false),
		skipConsent: integer("skip_consent", { mode: "boolean" }),
		enableEndSession: integer("enable_end_session", { mode: "boolean" }),
		subjectType: text("subject_type"),
		scopes: text("scopes"),
		clientCredentialsScopes: text("client_credentials_scopes"),
		userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(now),
		name: text("name"),
		uri: text("uri"),
		icon: text("icon"),
		contacts: text("contacts"),
		tos: text("tos"),
		policy: text("policy"),
		softwareId: text("software_id"),
		softwareVersion: text("software_version"),
		softwareStatement: text("software_statement"),
		redirectUris: text("redirect_uris").notNull(),
		postLogoutRedirectUris: text("post_logout_redirect_uris"),
		backchannelLogoutUri: text("backchannel_logout_uri"),
		backchannelLogoutSessionRequired: integer("backchannel_logout_session_required", {
			mode: "boolean",
		}),
		tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
		applicationType: text("application_type"),
		jwks: text("jwks"),
		jwksUri: text("jwks_uri"),
		grantTypes: text("grant_types"),
		responseTypes: text("response_types"),
		requirePKCE: integer("require_pkce", { mode: "boolean" }),
		dpopBoundAccessTokens: integer("dpop_bound_access_tokens", { mode: "boolean" }).default(false),
		referenceId: text("reference_id"),
		metadata: text("metadata"),
	},
	(table) => [index("oauthClient_userId_idx").on(table.userId)]
);

export const oauthResource = sqliteTable("oauth_resource", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull().unique(),
	name: text("name").notNull(),
	accessTokenTtl: integer("access_token_ttl"),
	refreshTokenTtl: integer("refresh_token_ttl"),
	signingAlgorithm: text("signing_algorithm"),
	signingKeyId: text("signing_key_id"),
	allowedScopes: text("allowed_scopes"),
	customClaims: text("custom_claims"),
	dpopBoundAccessTokensRequired: integer("dpop_bound_access_tokens_required", {
		mode: "boolean",
	}).default(false),
	disabled: integer("disabled", { mode: "boolean" }).default(false),
	createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(now),
	policyVersion: integer("policy_version").default(1),
	metadata: text("metadata"),
});

export const oauthClientResource = sqliteTable(
	"oauth_client_resource",
	{
		id: text("id").primaryKey(),
		clientId: text("client_id")
			.notNull()
			.references(() => oauthClient.clientId, { onDelete: "cascade" }),
		resourceId: text("resource_id")
			.notNull()
			.references(() => oauthResource.identifier, { onDelete: "cascade" }),
		metadata: text("metadata"),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now),
	},
	(table) => [
		index("oauthClientResource_clientId_idx").on(table.clientId),
		index("oauthClientResource_resourceId_idx").on(table.resourceId),
		uniqueIndex("oauthClientResource_clientId_resourceId_uidx").on(
			table.clientId,
			table.resourceId
		),
	]
);

export const oauthRefreshToken = sqliteTable(
	"oauth_refresh_token",
	{
		id: text("id").primaryKey(),
		token: text("token").notNull().unique(),
		clientId: text("client_id")
			.notNull()
			.references(() => oauthClient.clientId, { onDelete: "cascade" }),
		sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		referenceId: text("reference_id").references(() => organization.id, { onDelete: "cascade" }),
		authorizationCodeId: text("authorization_code_id"),
		resources: text("resources"),
		requestedUserInfoClaims: text("requested_user_info_claims"),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
		revoked: integer("revoked", { mode: "timestamp_ms" }),
		rotatedAt: integer("rotated_at", { mode: "timestamp_ms" }),
		rotationReplayResponse: text("rotation_replay_response"),
		rotationReplayExpiresAt: integer("rotation_replay_expires_at", { mode: "timestamp_ms" }),
		authTime: integer("auth_time", { mode: "timestamp_ms" }),
		confirmation: text("confirmation"),
		scopes: text("scopes").notNull(),
	},
	(table) => [
		index("oauthRefreshToken_clientId_idx").on(table.clientId),
		index("oauthRefreshToken_sessionId_idx").on(table.sessionId),
		index("oauthRefreshToken_userId_idx").on(table.userId),
		index("oauthRefreshToken_authorizationCodeId_idx").on(table.authorizationCodeId),
	]
);

export const oauthAccessToken = sqliteTable(
	"oauth_access_token",
	{
		id: text("id").primaryKey(),
		token: text("token").unique(),
		clientId: text("client_id")
			.notNull()
			.references(() => oauthClient.clientId, { onDelete: "cascade" }),
		sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
		userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
		referenceId: text("reference_id").references(() => organization.id, { onDelete: "cascade" }),
		authorizationCodeId: text("authorization_code_id"),
		resources: text("resources"),
		requestedUserInfoClaims: text("requested_user_info_claims"),
		refreshId: text("refresh_id").references(() => oauthRefreshToken.id, { onDelete: "cascade" }),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
		revoked: integer("revoked", { mode: "timestamp_ms" }),
		confirmation: text("confirmation"),
		scopes: text("scopes").notNull(),
	},
	(table) => [
		index("oauthAccessToken_clientId_idx").on(table.clientId),
		index("oauthAccessToken_sessionId_idx").on(table.sessionId),
		index("oauthAccessToken_userId_idx").on(table.userId),
		index("oauthAccessToken_authorizationCodeId_idx").on(table.authorizationCodeId),
		index("oauthAccessToken_refreshId_idx").on(table.refreshId),
	]
);

// A Connection = one row here: (clientId, userId, referenceId=orgId).
export const oauthConsent = sqliteTable(
	"oauth_consent",
	{
		id: text("id").primaryKey(),
		clientId: text("client_id")
			.notNull()
			.references(() => oauthClient.clientId, { onDelete: "cascade" }),
		userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
		referenceId: text("reference_id").references(() => organization.id, { onDelete: "cascade" }),
		resources: text("resources"),
		requestedUserInfoClaims: text("requested_user_info_claims"),
		scopes: text("scopes").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(now).notNull(),
	},
	(table) => [
		index("oauthConsent_clientId_idx").on(table.clientId),
		index("oauthConsent_userId_idx").on(table.userId),
		index("oauthConsent_referenceId_idx").on(table.referenceId),
	]
);

export const oauthClientAssertion = sqliteTable("oauth_client_assertion", {
	id: text("id").primaryKey(),
	expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});
