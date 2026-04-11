import { listMyOrganizationInvitations } from "@/api/organization";
import { RootLayout } from "@/components/RootLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { GalleryVerticalEnd } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { usePostHog } from "@posthog/react";

export const Route = createFileRoute("/_authed/onboarding/invitations/")({
	component: RouteComponent,
	loader: async () => {
		const response = await listMyOrganizationInvitations();
		return response;
	},
});

function AcceptInvitationAction(props: { invitationId: string; organizationName?: string }) {
	const [isPending, startTransition] = useTransition();
	const posthog = usePostHog();

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
			posthog.capture("invitation_accepted", {
				invitation_id: props.invitationId,
				organization_name: props.organizationName,
			});
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

function RejectInvitationAction(props: { invitationId: string; organizationName?: string }) {
	const [isPending, startTransition] = useTransition();
	const posthog = usePostHog();

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
			posthog.capture("invitation_rejected", {
				invitation_id: props.invitationId,
				organization_name: props.organizationName,
			});
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
		<RootLayout>
			<div className="flex flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
				<div className="flex w-full max-w-sm flex-col gap-6">
					<Route.Link to="/" className="flex items-center gap-2 self-center font-medium">
						<div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
							<GalleryVerticalEnd className="size-4" />
						</div>
						Kutumb
					</Route.Link>
					<div className={"flex flex-col gap-6"}>
						<Card>
							<CardHeader>
								<CardTitle>My Organization Invites</CardTitle>
								<CardDescription>
									You have been invited to join some organizations. Please accept or reject them
								</CardDescription>
							</CardHeader>
							<CardContent>
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
														<AcceptInvitationAction
															invitationId={invite.id}
															organizationName={invite.organizationName}
														/>
													) : null}
													{invite.status === "pending" ? (
														<RejectInvitationAction
															invitationId={invite.id}
															organizationName={invite.organizationName}
														/>
													) : null}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</CardContent>
						</Card>
					</div>
				</div>
			</div>
		</RootLayout>
	);
}
