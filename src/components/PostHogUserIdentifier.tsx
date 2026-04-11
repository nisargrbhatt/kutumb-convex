import { usePostHog } from "@posthog/react";
import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";

/**
 * Identifies the authenticated user with PostHog once the session is available.
 * Resets PostHog when the user signs out.
 * Must be rendered inside PostHogProvider.
 */
export default function PostHogUserIdentifier() {
	const posthog = usePostHog();
	const { data: session } = authClient.useSession();

	useEffect(() => {
		if (!posthog) return;

		if (session?.user) {
			posthog.identify(session.user.id, {
				email: session.user.email,
				name: session.user.name,
			});
		} else {
			posthog.reset();
		}
	}, [posthog, session]);

	return null;
}
