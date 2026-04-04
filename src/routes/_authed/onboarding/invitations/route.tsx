import { listMyOrganizationInvitations } from "@/api/organization";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { authClient } from "@/lib/auth-client";
import { createFileRoute } from "@tanstack/react-router";
import { useTransition } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authed/onboarding/invitations")({
	component: RouteComponent,
	loader: async () => {
		const response = await listMyOrganizationInvitations();
		return response;
	},
});

function AcceptInvitationAction(props: { invitationId: string }) {
	const [isPending, startTransition] = useTransition();

	const handleAccept = async () => {
		startTransition(async () => {
			const { error } = await authClient.organization.acceptInvitation({
				invitationId: props.invitationId,
			});
			if (error) {
				console.error(error);
				toast.error("Invitation", {
					description: "Failed to accept invitation",
				});
				return;
			}
			toast.success("Invitation", {
				description: "Invitation accepted successfully",
			});
		});
	};

	return (
		<Button type="button" size="sm" variant={"outline"} onClick={handleAccept} disabled={isPending}>
			{isPending ? <Spinner /> : null} Accept
		</Button>
	);
}

function RejectInvitationAction(props: { invitationId: string }) {
	const [isPending, startTransition] = useTransition();

	const handleReject = async () => {
		startTransition(async () => {
			const { error } = await authClient.organization.rejectInvitation({
				invitationId: props.invitationId,
			});
			if (error) {
				console.error(error);
				toast.error("Invitation", {
					description: "Failed to reject invitation",
				});
				return;
			}
			toast.success("Invitation", {
				description: "Invitation rejected successfully",
			});
		});
	};

	return (
		<Button
			type="button"
			className="mx-1"
			size="sm"
			variant={"outline"}
			onClick={handleReject}
			disabled={isPending}
		>
			{isPending ? <Spinner /> : null} Reject
		</Button>
	);
}

function RouteComponent() {
	const invitations = Route.useLoaderData();

	return (
		<div className="flex h-full w-full flex-col items-center justify-start gap-2 py-2">
			<h1 className="text-xl font-bold">Your Organization Invites</h1>
			<div className="w-full max-w-xl">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-[100px]">Organization Name</TableHead>
							<TableHead>Role</TableHead>
							<TableHead>Status</TableHead>
							<TableHead className="text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{invitations?.length < 1 ? (
							<TableRow>
								<TableCell className="text-center" colSpan={4}>
									No organization invites found
								</TableCell>
							</TableRow>
						) : null}
						{invitations.map((invite) => (
							<TableRow key={invite.id}>
								<TableCell className="font-medium">{invite.organizationName}</TableCell>
								<TableCell className="capitalize">{invite.role}</TableCell>
								<TableCell className="capitalize">{invite.status}</TableCell>
								<TableCell className="text-right">
									{invite.status === "pending" ? (
										<AcceptInvitationAction invitationId={invite.id} />
									) : null}
									{invite.status === "pending" ? (
										<RejectInvitationAction invitationId={invite.id} />
									) : null}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
