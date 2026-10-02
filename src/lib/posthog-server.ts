import { PostHog } from "posthog-node";
import { env, waitUntil } from "cloudflare:workers";
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
	limit: "org" | "member" | "profile";
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
			},
		});
		waitUntil(client.flush());
	} catch (error) {
		console.error("Failed to capture mcp_tool_called event", error);
	}
}
