import { PostHog } from "posthog-node";
import { env, waitUntil } from "cloudflare:workers";
import type { LimitKind } from "@/domain/limits";
import type { RegistrationKind } from "@/domain/mcpOauth";
import type { WriteOutcome } from "@/domain/mcpWrite";

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

/** Fire-and-forget capture + flush; analytics never throws into the caller. */
function capture(event: string, distinctId: string, properties: Record<string, unknown>) {
	try {
		const client = getPostHogClient();
		client.capture({ distinctId, event, properties });
		waitUntil(client.flush());
	} catch (error) {
		console.error(`Failed to capture ${event} event`, error);
	}
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
	capture("mcp_connection_created", props.userId, {
		orgId: props.organizationId,
		clientId: props.clientId,
		registration: props.registration,
		write: props.write,
	});
}

/** One MCP tool call. Carries no tool input or output. */
export function captureMcpToolCalled(props: {
	tool: string;
	userId: string;
	organizationId: string;
	clientId: string;
	isError: boolean;
	durationMs?: number;
	/** Write tools only. */
	outcome?: WriteOutcome;
}) {
	capture("mcp_tool_called", props.userId, {
		tool: props.tool,
		orgId: props.organizationId,
		clientId: props.clientId,
		isError: props.isError,
		...(props.durationMs === undefined ? {} : { durationMs: props.durationMs }),
		...(props.outcome ? { outcome: props.outcome } : {}),
	});
}

/** A member revoked one of their Connections from the Connections page. */
export function captureMcpConnectionRevoked(props: {
	userId: string;
	organizationId: string;
	clientId: string;
}) {
	capture("mcp_connection_revoked", props.userId, {
		orgId: props.organizationId,
		clientId: props.clientId,
	});
}

/** A member dropped `community:write` from one of their Connections ("Make read only"). */
export function captureConnectionDowngraded(props: {
	userId: string;
	organizationId: string;
	clientId: string;
}) {
	capture("connection_downgraded", props.userId, {
		orgId: props.organizationId,
		clientId: props.clientId,
	});
}

/** The owner switched "AI Client writes" for the community. Carries no names or values. */
export function captureAiClientWritesToggled(props: {
	userId: string;
	organizationId: string;
	enabled: boolean;
}) {
	capture("ai_client_writes_toggled", props.userId, {
		orgId: props.organizationId,
		enabled: props.enabled,
	});
}
