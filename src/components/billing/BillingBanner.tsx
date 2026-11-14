import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CreditCard, Info, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bannerFor, type Banner, type BannerTone } from "@/domain/billingBanner";
import { cn } from "@/lib/utils";
import { activeOrgBillingQuery, useOpenPortal, useResumeSubscription } from "@/queries/billing";

const TONE: Record<BannerTone, string> = {
	info: "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100",
	warning:
		"border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
	danger: "border-destructive/30 bg-destructive/10 text-destructive",
};

/** Full-width billing strip above `_community` pages; renders nothing when there's no banner. */
export function BillingBanner({ orgId }: { orgId: string }) {
	const { data: banner } = useQuery({
		...activeOrgBillingQuery(orgId),
		select: (b) =>
			bannerFor(b.access, b.role, {
				orgName: b.orgName,
				price: b.price ?? "",
				ownerNames: b.ownerNames,
			}),
	});
	if (!banner) return null;
	const Icon = banner.tone === "info" ? Info : AlertTriangle;
	return (
		<div
			role={banner.tone === "danger" ? "alert" : "status"}
			className={cn(
				"flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2 text-sm",
				TONE[banner.tone]
			)}
		>
			<div className="flex min-w-0 flex-1 items-center gap-2">
				<Icon className="size-4 shrink-0" aria-hidden />
				<span className="min-w-0 break-words">{banner.text}</span>
			</div>
			{banner.action && <BannerCta orgId={orgId} banner={banner} />}
		</div>
	);
}

function BannerCta({ orgId, banner }: { orgId: string; banner: Banner }) {
	const portal = useOpenPortal();
	const resume = useResumeSubscription(orgId);
	if (!banner.action) return null;
	const run = banner.action.kind === "resume" ? resume : portal;
	return (
		<Button
			size="sm"
			className="shrink-0"
			variant={banner.tone === "danger" ? "destructive" : "default"}
			disabled={run.isPending}
			onClick={() => run.mutate()}
		>
			{banner.action.kind === "resume" ? <Sparkles /> : <CreditCard />} {banner.action.label}
		</Button>
	);
}
