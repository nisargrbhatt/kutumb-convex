import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

export const Route = createFileRoute("/api/ph/$")({
	server: {
		handlers: {
			ANY: ({ request }) => {
				const url = new URL(request.url);
				const path = url.pathname.replace("/api/ph/", "");
				url.pathname = `/${path}`;
				url.protocol = "https";
				url.hostname = new URL(env.VITE_PUBLIC_POSTHOG_HOST).hostname;
				url.port = "443";

				return fetch(url, request);
			},
		},
	},
});
