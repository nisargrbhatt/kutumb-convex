import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
	myRequestsQuery,
	pendingForProfileQuery,
	useWithdrawChangeRequest,
} from "@/queries/changeRequest";

/**
 * Member-side banners on a profile detail page: a `draft` reads "Awaiting review" (its submitter
 * can withdraw it, deleting the draft); otherwise a plain member with pending requests on this
 * profile sees "Your change is pending" → My requests. Owner/admin pending banner: Reviews slice.
 */
export function ProfileRequestBanner({
	orgId,
	profile,
	canReview,
}: {
	orgId: string;
	profile: { id: string; status: string };
	canReview: boolean;
}) {
	if (profile.status === "draft") return <DraftBanner orgId={orgId} profileId={profile.id} />;
	if (canReview) return null;
	return <PendingMineBanner orgId={orgId} profileId={profile.id} />;
}

function DraftBanner({ orgId, profileId }: { orgId: string; profileId: string }) {
	const navigate = useNavigate();
	const [confirmOpen, setConfirmOpen] = useState(false);
	const { data: mine } = useQuery(myRequestsQuery(orgId));
	const createRequest = mine?.find(
		(r) => r.profileId === profileId && r.kind === "create" && r.status === "pending"
	);
	// The draft is deleted: leave its page before the detail query refetches into NotFound.
	const withdraw = useWithdrawChangeRequest(() => navigate({ to: "/my-requests" }));

	return (
		<Alert>
			<Clock />
			<AlertTitle>Awaiting review</AlertTitle>
			<AlertDescription>
				This draft is visible only to its creator and owner/admins until it is reviewed.
			</AlertDescription>
			{createRequest ? (
				<AlertAction>
					<ConfirmDialog
						open={confirmOpen}
						onOpenChange={setConfirmOpen}
						trigger={
							<Button size="sm" variant="outline">
								Withdraw
							</Button>
						}
						title="Withdraw this draft?"
						description="The draft profile will be deleted. This cannot be undone."
						confirmLabel="Withdraw"
						destructive
						onConfirm={() => withdraw.mutate(createRequest.id)}
						isPending={withdraw.isPending}
					/>
				</AlertAction>
			) : null}
		</Alert>
	);
}

function PendingMineBanner({ orgId, profileId }: { orgId: string; profileId: string }) {
	const { data } = useQuery(pendingForProfileQuery(orgId, profileId));
	if (!data || data.scope !== "mine" || data.count === 0) return null;
	const n = data.count;

	return (
		<Alert>
			<Clock />
			<AlertTitle>Your change is pending</AlertTitle>
			<AlertDescription>
				{n === 1 ? "1 suggestion" : `${n} suggestions`} awaiting review. Everyone sees the current
				info until an owner/admin reviews {n === 1 ? "it" : "them"}.
			</AlertDescription>
			<AlertAction>
				<Button size="sm" variant="outline" render={<Link to="/my-requests" />} nativeButton={false}>
					My requests
				</Button>
			</AlertAction>
		</Alert>
	);
}
