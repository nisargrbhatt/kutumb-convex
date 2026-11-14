import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AuthCardShell } from "@/components/auth/AuthCardShell";
import { OauthRequestError } from "@/components/oauth/OauthRequestError";
import { OrgCardIcon } from "@/components/oauth/OrgCardIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ONBOARDING_CREATE_PATH } from "@/domain/authRoutes";
import { useOauthStep } from "@/hooks/useOauthStep";
import { authClient } from "@/lib/auth-client";
import { oauthBeforeLoad } from "@/lib/oauth-gate";
import { safeAsync } from "@/lib/safe";
import {
	getOauthSelectOrgFn,
	pickOauthOrgFn,
	type OauthClientInfo,
	type OauthSelectOrg,
} from "@/server/oauth";

export const Route = createFileRoute("/oauth/select-org")({
	beforeLoad: oauthBeforeLoad,
	loader: ({ context }) =>
		context.clientId ? getOauthSelectOrgFn({ data: { clientId: context.clientId } }) : null,
	head: () => ({ meta: [{ title: "Choose a community | Kutumb App" }] }),
	component: RouteComponent,
});

function RouteComponent() {
	const data = Route.useLoaderData();
	if (!data?.client) return <OauthRequestError />;
	return <SelectOrg {...data} client={data.client} />;
}

type SelectOrgProps = {
	client: OauthClientInfo;
	orgs: OauthSelectOrg[];
	activeOrganizationId: string | null;
	email: string;
};

function SelectOrg({ client, orgs, activeOrganizationId, email }: SelectOrgProps) {
	// Locked orgs are listed but can't be picked.
	const pickable = orgs.filter((o) => !o.lockReason);
	const preselected = pickable.find((o) => o.id === activeOrganizationId) ?? pickable[0];
	const [orgId, setOrgId] = useState(preselected?.id ?? "");
	const { pending, setPending, run } = useOauthStep();

	const onContinue = async () => {
		setPending(true);
		const picked = await safeAsync(pickOauthOrgFn({ data: { organizationId: orgId } }));
		if (!picked.success) {
			toast.error("Could not select that community");
			setPending(false);
			return;
		}
		await run(() => authClient.oauth2.continue({ postLogin: true }), "Could not continue");
	};

	const onCancel = () =>
		run(() => authClient.oauth2.consent({ accept: false }), "Could not cancel");

	if (orgs.length === 0) {
		return (
			<AuthCardShell
				title="No community yet"
				description={`${client.name} wants to read a Kutumb community, but you aren't part of one.`}
				footer="You can close this tab and reconnect from your AI app later."
			>
				<div className="flex flex-col gap-3">
					<Button render={<Link to={ONBOARDING_CREATE_PATH} />}>Create a community</Button>
					<p className="text-center text-xs text-muted-foreground">
						Invited to one? Accept the invitation from your email first.
					</p>
				</div>
			</AuthCardShell>
		);
	}

	return (
		<AuthCardShell
			title="Choose a community"
			description={
				<>
					<b>{client.name}</b> wants to connect to Kutumb. Pick the community it can read.
				</>
			}
			footer={<>Signed in as {email}</>}
		>
			<div className="flex flex-col gap-4">
				<RadioGroup
					value={orgId}
					onValueChange={(v) => setOrgId(String(v))}
					className="gap-2"
					aria-label="Community"
				>
					{orgs.map((o) => (
						<label
							key={o.id}
							className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 has-disabled:cursor-not-allowed has-disabled:opacity-60 has-data-checked:border-primary has-data-checked:bg-muted"
						>
							<RadioGroupItem value={o.id} disabled={!!o.lockReason} />
							<OrgCardIcon />
							<div className="flex min-w-0 flex-1 flex-col">
								<span className="truncate text-sm font-medium">{o.name}</span>
								<span className="truncate text-xs text-muted-foreground">
									{o.lockReason ? "Locked: an owner must subscribe" : o.slug}
								</span>
							</div>
							<Badge variant={o.lockReason ? "secondary" : "outline"} className="capitalize">
								{o.lockReason ? "Locked" : o.role}
							</Badge>
						</label>
					))}
				</RadioGroup>
				<div className="flex gap-2">
					<Button variant="outline" className="flex-1" disabled={pending} onClick={onCancel}>
						Cancel
					</Button>
					<Button className="flex-1" disabled={pending || !orgId} onClick={onContinue}>
						Continue
					</Button>
				</div>
			</div>
		</AuthCardShell>
	);
}
