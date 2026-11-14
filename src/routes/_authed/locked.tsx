import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import z from "zod";
import { LockScreen } from "@/components/billing/LockScreen";
import { ONBOARDING_CREATE_PATH } from "@/domain/authRoutes";
import { activeOrgBillingQuery } from "@/queries/billing";

/** Lock screen for the active org (outside `_community`); unlocked → `/dashboard`. */
export const Route = createFileRoute("/_authed/locked")({
	// `from=dodo`: owner back from Dodo → confirm the payment (poll `syncBillingFn`).
	validateSearch: z.object({ from: z.literal("dodo").optional().catch(undefined) }),
	beforeLoad: async ({ context }) => {
		const organizationId = context.session?.session.activeOrganizationId;
		if (typeof organizationId !== "string") throw redirect({ to: ONBOARDING_CREATE_PATH });
		const billing = await context.queryClient.fetchQuery({
			...activeOrgBillingQuery(organizationId),
			staleTime: 0,
		});
		if (!billing.access.locked) throw redirect({ to: "/dashboard" });
		return { organizationId };
	},
	head: () => ({ meta: [{ title: "Organization locked | Kutumb App" }] }),
	component: RouteComponent,
});

function RouteComponent() {
	const { organizationId } = Route.useRouteContext();
	const { from } = Route.useSearch();
	const { data } = useSuspenseQuery(activeOrgBillingQuery(organizationId));
	return <LockScreen orgId={organizationId} billing={data} fromDodo={from === "dodo"} />;
}
