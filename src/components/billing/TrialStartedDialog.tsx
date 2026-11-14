import { useQuery } from "@tanstack/react-query";
import { Check, CreditCard, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { TRIAL_DAYS } from "@/domain/billing";
import { trialSummaryQuery, useOpenPortal } from "@/queries/billing";

const PRICE = "$5";

const formatDate = (d: Date) =>
	new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** One-time, owners only: shown after org create (`/dashboard?trialStarted=1`). */
export function TrialStartedDialog({
	orgId,
	orgName,
	open,
	onClose,
}: {
	orgId: string;
	orgName: string;
	open: boolean;
	onClose: () => void;
}) {
	const { data } = useQuery({ ...trialSummaryQuery(orgId), enabled: open });
	const portal = useOpenPortal();
	const ends = data ? formatDate(data.trialEndsAt) : null;

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Sparkles className="size-5" /> Your {TRIAL_DAYS}-day free trial has started
					</DialogTitle>
					<DialogDescription>
						{orgName} is ready.{ends ? ` Trial ends ${ends}.` : ""} No charge unless you add payment
						details. After the trial it's {PRICE}/month + applicable tax for the whole organization.
					</DialogDescription>
				</DialogHeader>
				<ul className="flex flex-col gap-1 text-sm">
					<li className="flex gap-2">
						<Check className="size-4 shrink-0 text-emerald-600" /> Add a card now: first charge
						{ends ? ` on ${ends}` : " when the trial ends"}, not before.
					</li>
					<li className="flex gap-2">
						<Check className="size-4 shrink-0 text-emerald-600" /> Or later from Settings → Billing.
					</li>
				</ul>
				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Later
					</Button>
					<Button onClick={() => portal.mutate()} disabled={portal.isPending}>
						<CreditCard /> Add payment now
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
