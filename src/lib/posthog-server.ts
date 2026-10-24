import { PostHog } from "posthog-node";
import { env, waitUntil } from "cloudflare:workers";
import type { LimitKind } from "@/domain/limits";
import type { RegistrationKind } from "@/domain/mcpOauth";

let posthogClient: PostHog | null = null;

export function getPostHogClient() {
	if (!posthogClient) {
		posthogClient = new PostHog(env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN, {
			host: env.VITE_PUBLIC_POSTHOG_HOST,
			flushAt: 1,
			flushInterval: 0,
		});
	}
	return posthogClient;
}

export function captureLimitReached(props: {
	limit: LimitKind;
	organizationId?: string;
	userId?: string;
}) {
	try {
		getPostHogClient().capture({
			distinctId: props.userId,
			event: "limit_reached",
			properties: { limit: props.limit, organizationId: props.organizationId },
		});
	} catch (error) {
		console.error("Failed to capture limit_reached event", error);
	}
}

/** Fired when a member Allows an AI Client at consent. Never carries tool data. */
export function captureMcpConnectionCreated(props: {
	userId: string;
	organizationId: string;
	clientId: string;
	registration: RegistrationKind;
	/** Member chose "Read and make changes" (`community:write` granted). */
	write: boolean;
}) {
	try {
		const client = getPostHogClient();
		client.capture({
			distinctId: props.userId,
			event: "mcp_connection_created",
			properties: {
				orgId: props.organizationId,
				clientId: props.clientId,
				registration: props.registration,
				write: props.write,
			},
		});
		waitUntil(client.flush());
	} catch (error) {
		console.error("Failed to capture mcp_connection_created event", error);
	}
}

/** One MCP tool call. Carries no tool input or output. */
export function captureMcpToolCalled(props: {
	tool: string;
	userId: string;
	organizationId: string;
	clientId: string;
	isError: boolean;
	durationMs: number;
	/** Write tools only: applied | requested | unchanged | possible_duplicate. */
	outcome?: string;
}) {
	try {
		const client = getPostHogClient();
		client.capture({
			distinctId: props.userId,
			event: "mcp_tool_called",
			properties: {
				tool: props.tool,
				orgId: props.organizationId,
				clientId: props.clientId,
				isError: props.isError,
				durationMs: props.durationMs,
				...(props.outcome ? { outcome: props.outcome } : {}),
			},
		});
		waitUntil(client.flush());
	} catch (error) {
		console.error("Failed to capture mcp_tool_called event", error);
	}
}

/** A member revoked one of their Connections from the Connections page. */
export function captureMcpConnectionRevoked(props: {
	userId: string;
	organizationId: string;
	clientId: string;
}) {
	try {
		const client = getPostHogClient();
		client.capture({
			distinctId: props.userId,
			event: "mcp_connection_revoked",
			properties: { orgId: props.organizationId, clientId: props.clientId },
		});
		waitUntil(client.flush());
	} catch (error) {
		console.error("Failed to capture mcp_connection_revoked event", error);
	}
}

/** The owner switched "AI Client writes" for the community. Carries no names or values. */
export function captureAiClientWritesToggled(props: {
	userId: string;
	organizationId: string;
	enabled: boolean;
}) {
	try {
		const client = getPostHogClient();
		client.capture({
			distinctId: props.userId,
			event: "ai_client_writes_toggled",
			properties: { orgId: props.organizationId, enabled: props.enabled },
		});
		waitUntil(client.flush());
	} catch (error) {
		console.error("Failed to capture ai_client_writes_toggled event", error);
	}
}
