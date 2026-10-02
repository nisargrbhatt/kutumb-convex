import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, BadgeCheck, Eye, RefreshCw, UserRound } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import { AuthCardShell } from "@/components/auth/AuthCardShell";
import { OauthRequestError } from "@/components/oauth/OauthRequestError";
import { OrgCardIcon } from "@/components/oauth/OrgCardIcon";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { OAUTH_SELECT_ORG_PATH } from "@/domain/mcpOauth";
import { useOauthStep } from "@/hooks/useOauthStep";
import { authClient } from "@/lib/auth-client";
import { oauthBeforeLoad } from "@/lib/oauth-gate";
import { safeAsync } from "@/lib/safe";
import {
	assertConsentOrgFn,
	getOauthConsentFn,
	type OauthClientInfo,
	type OauthOrg,
} from "@/server/oauth";

export const Route = createFileRoute("/oauth/consent")({
	beforeLoad: oauthBeforeLoad,
	loader: ({ context }) =>
		context.clientId ? getOauthConsentFn({ data: { clientId: context.clientId } }) : null,
	head: () => ({ meta: [{ title: "Authorize app | Kutumb App" }] }),
	component: RouteComponent,
});

// The signed authorization query must go back to the plugin untouched, so it is read from
// `window.location.search`: the router re-encodes its own `search`/`href` (repeated `ba_param`).
const selectOrgHref = () => `${OAUTH_SELECT_ORG_PATH}${window.location.search}`;

function RouteComponent() {
	const data = Route.useLoaderData();
	const needsOrg = !!data?.client && !data.org;

	// No community picked yet (opened directly): the picker comes first.
	useEffect(() => {
		if (needsOrg) window.location.replace(selectOrgHref());
	}, [needsOrg]);

	if (needsOrg) return null;
	if (!data?.client || !data.org) return <OauthRequestError />;
	return <Consent client={data.client} org={data.org} />;
}

function Consent({ client, org }: { client: OauthClientInfo; org: OauthOrg }) {
	const { pending, setPending, run } = useOauthStep();
	const verified = client.registration === "cimd";

	const allow = async () => {
		setPending(true);
		const check = await safeAsync(assertConsentOrgFn({ data: { organizationId: org.id } }));
		if (!check.success || !check.data.same) {
			toast.error("Your community changed in another tab", { description: "Reload to review it." });
			setPending(false);
			return;
		}
		await run(() => authClient.oauth2.consent({ accept: true }), "Could not allow access");
	};

	const deny = () =>
		run(() => authClient.oauth2.consent({ accept: false }), "Could not deny access");

	return (
		<AuthCardShell
			title={
				<span className="flex items-center gap-2">
					Allow {client.name}?
					{verified ? (
						<BadgeCheck className="size-5 text-primary" role="img" aria-label="Verified" />
					) : null}
				</span>
			}
			description={
				client.host ? (
					<>
						{verified ? "Verified as " : "Says it's from "}
						<span className="font-mono break-all">{client.host}</span>
					</>
				) : undefined
			}
			footer="Revoke any time in Profile → AI."
		>
			<div className="flex flex-col gap-4">
				{verified ? null : (
					<Alert variant="destructive">
						<AlertTriangle />
						<AlertTitle>Unverified app</AlertTitle>
						<AlertDescription>
							Kutumb can't confirm who made this app. Only allow it if you set it up yourself.
						</AlertDescription>
					</Alert>
				)}
				<div className="flex items-center gap-3 rounded-lg border p-3">
					<OrgCardIcon />
					<div className="flex min-w-0 flex-1 flex-col">
						<span className="truncate text-sm font-medium">{org.name}</span>
						<span className="text-xs text-muted-foreground">as {org.role}</span>
					</div>
					<a
						href={OAUTH_SELECT_ORG_PATH}
						onClick={(e) => {
							e.preventDefault();
							window.location.assign(selectOrgHref());
						}}
						className="text-xs underline underline-offset-4"
					>
						Change
					</a>
				</div>
				<Separator />
				<ul className="flex flex-col gap-3 text-sm">
					<li className="flex gap-3">
						<Eye className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
						<span>
							<b>Read</b> member profiles, addresses, custom fields and family relations you can see
							in this community.
						</span>
					</li>
					<li className="flex gap-3">
						<UserRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
						<span>Act as you, with your current role. It can't change anything.</span>
					</li>
					<li className="flex gap-3">
						<RefreshCw className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
						<span>Stay connected until you revoke it, or 30 days without use.</span>
					</li>
				</ul>
				<div className="flex gap-2">
					<Button variant="outline" className="flex-1" disabled={pending} onClick={deny}>
						Deny
					</Button>
					<Button className="flex-1" disabled={pending} onClick={allow}>
						Allow
					</Button>
				</div>
			</div>
		</AuthCardShell>
	);
}
