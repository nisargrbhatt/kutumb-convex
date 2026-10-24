import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AccessLevelCards, type AccessLevel } from "@/components/ai/AccessLevelCards";
import { PageHeader } from "@/components/CommunityLayout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useActor } from "@/hooks/useActor";
import { aiSettingsQuery, useSetAiClientWrites } from "@/queries/aiSettings";

export const Route = createFileRoute("/_authed/_community/settings/ai/")({
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(aiSettingsQuery(context.organizationId));
	},
	head: () => ({ meta: [{ title: "AI | Kutumb App" }] }),
	component: RouteComponent,
});

const OPTIONS = [
	{ value: "read", body: "AI Clients can look things up. They can't change anything." },
	{
		value: "write",
		body: "Members can let their AI Clients add and edit. Owner and admin changes apply right away; member changes become requests for review.",
	},
] as const;

function RouteComponent() {
	const actor = useActor();
	const { data } = useSuspenseQuery(aiSettingsQuery(actor?.organizationId ?? ""));
	const setWrites = useSetAiClientWrites();
	const [confirmOff, setConfirmOff] = useState(false);
	const isOwner = actor?.role === "owner";
	const level: AccessLevel = data.aiClientWrites ? "write" : "read";

	const onChange = (next: AccessLevel) => {
		if (next === level) return;
		if (next === "read") setConfirmOff(true);
		else setWrites.mutate(true);
	};

	return (
		<div className="flex h-full w-full flex-col items-start justify-start gap-4 p-2">
			<PageHeader
				crumbs={[{ label: "Settings", to: "/settings/overview" }, { label: "AI" }]}
				title="AI"
				description="Control what AI Clients connected by your members can do here."
			/>
			<Card className="w-full max-w-3xl">
				<CardHeader>
					<CardTitle>What can AI Clients do in this community?</CardTitle>
					<CardDescription>Applies to every member's connected AI Clients.</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<AccessLevelCards
						aria-label="What AI Clients can do in this community"
						value={level}
						onChange={onChange}
						options={[...OPTIONS]}
						disabled={!isOwner || setWrites.isPending}
						className="sm:grid-cols-2"
					/>
					{isOwner ? null : (
						<p className="text-xs text-muted-foreground">Only the owner can change this.</p>
					)}
					<ConfirmDialog
						open={confirmOff}
						onOpenChange={setConfirmOff}
						title="Make AI Clients read only?"
						description="Write tools disappear for everyone right away. Pending AI requests stay in Reviews. Members aren't notified."
						confirmLabel="Make read only"
						destructive
						isPending={setWrites.isPending}
						onConfirm={() => setWrites.mutate(false, { onSettled: () => setConfirmOff(false) })}
					/>
				</CardContent>
			</Card>
		</div>
	);
}
