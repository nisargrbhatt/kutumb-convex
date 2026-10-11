import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ClipboardCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { pendingForProfileQuery } from "@/queries/changeRequest";

/** Owner/admin on member detail: "N pending changes" → that profile's Reviews drawer. */
export function PendingReviewBanner({ orgId, profileId }: { orgId: string; profileId: string }) {
	const { data } = useQuery(pendingForProfileQuery(orgId, profileId));
	if (!data || data.scope !== "all" || data.count === 0) return null;
	return (
		<Alert>
			<ClipboardCheck />
			<AlertTitle>
				{data.count} pending change{data.count === 1 ? "" : "s"}
			</AlertTitle>
			<AlertDescription>
				<Link
					to="/reviews"
					search={{ profile: profileId }}
					className="font-medium text-primary underline-offset-4 hover:underline"
				>
					Review on the Reviews page
				</Link>
			</AlertDescription>
		</Alert>
	);
}
