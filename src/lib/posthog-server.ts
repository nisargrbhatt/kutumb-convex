import { PostHog } from "posthog-node";
import { env } from "cloudflare:workers";

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
	organizationId: string;
	userId: string;
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
