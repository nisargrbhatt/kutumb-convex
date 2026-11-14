import { createRouter } from "@tanstack/react-router";
// Import the generated route tree
import { routeTree } from "./routeTree.gen";
import { NotFound } from "./components/NotFound";
import { DefaultCatchBoundary } from "./components/DefaultCatchBoundary";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { isLockedError } from "./domain/errors";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

// Create a new router instance
export const getRouter = () => {
	// Per router = per SSR request: a module singleton would share cache across users/tenants.
	// Org Locked mid-session: drop cached billing and re-run route gates (`_community` → `/locked`).
	const onError = (error: unknown) => {
		if (!isLockedError(error)) return;
		void queryClient
			.invalidateQueries({ queryKey: ["billing"], refetchType: "none" })
			.then(() => router.invalidate());
	};
	const queryClient: QueryClient = new QueryClient({
		queryCache: new QueryCache({ onError }),
		mutationCache: new MutationCache({ onError }),
	});
	const router = createRouter({
		routeTree,
		context: {
			queryClient,
		},
		scrollRestoration: true,
		defaultPreloadStaleTime: 0,
		defaultErrorComponent: DefaultCatchBoundary,
		defaultNotFoundComponent: () => <NotFound />,
		defaultPreload: "intent",
	});

	setupRouterSsrQueryIntegration({
		router,
		queryClient,
	});

	return router;
};

// Register things for typesafety
declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
