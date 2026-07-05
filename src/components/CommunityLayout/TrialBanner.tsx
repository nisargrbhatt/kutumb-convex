import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "../ui/button";
import { authClient } from "@/lib/auth-client";
import type { ResolvedOrgStatus } from "@/lib/org-status";

const TRIAL_BANNER_THRESHOLD_DAYS = 3;

interface Props {
	orgStatus: ResolvedOrgStatus;
}

export function TrialBanner({ orgStatus }: Props) {
	const [dismissed, setDismissed] = useState(false);
	const { data: activeOrg } = authClient.useActiveOrganization();

	if (dismissed || !orgStatus.inTrial || orgStatus.trialDaysLeft > TRIAL_BANNER_THRESHOLD_DAYS) {
		return null;
	}

	const goToCheckout = async () => {
		await authClient.checkout({ slug: "org-product", referenceId: activeOrg?.id });
	};

	const dayLabel = orgStatus.trialDaysLeft === 1 ? "day" : "days";

	return (
		<div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b bg-muted px-4 py-2 text-sm">
			<span className="text-muted-foreground">
				{orgStatus.trialDaysLeft} {dayLabel} left in your trial.
			</span>
			<Button type="button" size="sm" variant="outline" onClick={goToCheckout}>
				Set up payment
			</Button>
			<Button
				type="button"
				size="icon"
				variant="ghost"
				className="ml-auto size-6"
				aria-label="Dismiss"
				onClick={() => setDismissed(true)}
			>
				<X className="size-4" />
			</Button>
		</div>
	);
}
