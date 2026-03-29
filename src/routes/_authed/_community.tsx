import { CommunityLayout } from "@/components/CommunityLayout/CommunityLayout";
import { checkOrgPaymentDone } from "@/handler/organization";
import { createFileRoute } from "@tanstack/react-router";
import { PaymentRequiredBanner } from "./-components/PaymentRequiredBanner";

export const Route = createFileRoute("/_authed/_community")({
	beforeLoad: async () => {
		const result = await checkOrgPaymentDone();
		return result;
	},
	loader: async ({ context }) => ({ paymentPending: context.paymentPending }),
	component: CommunityLayoutComponent,
});

function CommunityLayoutComponent() {
	const { paymentPending } = Route.useLoaderData();

	if (paymentPending) {
		return <PaymentRequiredBanner />;
	}

	return <CommunityLayout />;
}
