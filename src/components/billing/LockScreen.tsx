import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import {
	Building,
	Check,
	CreditCard,
	Lock,
	LogOut,
	Plus,
	ShieldCheck,
	Sparkles,
	Users,
} from "lucide-react";
import z from "zod";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormDrawer } from "@/components/ui/form-drawer";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { loginHref, ONBOARDING_CREATE_PATH } from "@/domain/authRoutes";
import { lockScreenCopy, primaryAction } from "@/domain/billingCopy";
import type { ActiveOrgBilling } from "@/domain/queries/activeOrgBilling";
import { useActor } from "@/hooks/useActor";
import { authClient } from "@/lib/auth-client";
import { safeAsync } from "@/lib/safe";
import { useOpenPortal, useStartCheckout } from "@/queries/billing";
import { billingKeys } from "@/queries/keys";
import {
	orgMembersQuery,
	useDeleteOrganization,
	useLeaveOrganization,
	useSwitchOrganization,
	useTransferOwnership,
} from "@/queries/organization";
import { syncBillingFn } from "@/server/billing";

/** `/locked` (spec: UI > Lock screen; prototype Variant A). */
export function LockScreen({
	orgId,
	billing,
	fromDodo,
}: {
	orgId: string;
	billing: ActiveOrgBilling;
	fromDodo: boolean;
}) {
	const reason = billing.access.lockReason ?? "trial_ended";
	const owner = billing.isOwner;
	const copy = lockScreenCopy(reason, {
		orgName: billing.orgName,
		price: billing.price ?? undefined,
		owner,
		ownerNames: billing.ownerNames,
	});
	const confirm = useConfirmPayment(orgId, fromDodo && owner);

	return (
		<div className="flex min-h-svh w-full flex-col bg-muted p-4 sm:p-6">
			{/* No sidebar outside `_community`: plain crumbs (org › Locked). */}
			<Breadcrumb className="min-w-0">
				<BreadcrumbList>
					<BreadcrumbItem className="min-w-0">
						<span className="truncate">{billing.orgName}</span>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>Locked</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
			<div className="flex flex-1 items-center justify-center py-4">
				<Card className="w-full max-w-md text-center">
					<CardHeader className="items-center">
						<Lock className="mx-auto size-8" aria-hidden />
						<CardTitle className="text-xl">
							<h1>{copy.title}</h1>
						</CardTitle>
						<CardDescription>{copy.body}</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col items-center gap-4">
						<p className="flex items-center gap-2 text-sm text-muted-foreground">
							<ShieldCheck className="size-4 shrink-0 text-emerald-600" aria-hidden />
							Your data is safe. Nothing is deleted while locked.
						</p>
						{confirm !== "idle" ? (
							<p role="status" className="flex items-center gap-2 text-sm">
								{confirm === "confirming" ? (
									<>
										<Spinner /> Confirming your payment…
									</>
								) : (
									"Still processing; refresh in a minute."
								)}
							</p>
						) : null}
						{owner ? (
							<div className="flex w-full flex-col items-center gap-3">
								<OwnerPrimary billing={billing} disabled={confirm === "confirming"} />
								<div className="flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:justify-center">
									<TransferOwnershipDrawer orgId={orgId} />
									<DeleteOrganizationDialog name={billing.orgName} />
								</div>
							</div>
						) : (
							<LeaveOrganizationDialog name={billing.orgName} />
						)}
						<Separator />
						<OrgEscapes />
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

function OwnerPrimary({ billing, disabled }: { billing: ActiveOrgBilling; disabled: boolean }) {
	const portal = useOpenPortal("locked");
	const checkout = useStartCheckout();
	const action = primaryAction(billing.access, {
		orgName: billing.orgName,
		price: billing.price ?? "$5",
	});
	if (!action || action.kind === "resume") return null;
	const run = action.kind === "checkout" ? checkout : portal;
	return (
		<Button
			size="lg"
			className="w-full sm:w-auto"
			disabled={disabled || run.isPending}
			onClick={() => run.mutate()}
		>
			{run.isPending ? (
				<Spinner />
			) : action.kind === "portal" && billing.access.lockReason === "payment_failed" ? (
				<CreditCard />
			) : (
				<Sparkles />
			)}
			{action.label}
		</Button>
	);
}

const CONFIRM_WINDOW_MS = 30_000;
const CONFIRM_POLL_MS = 5_000;

/**
 * Back from Dodo: pull the sub (`syncBillingFn`) every 5s for ≤30s; unlocked → dashboard. Else
 * "Still processing" (the webhook still unlocks later).
 */
function useConfirmPayment(orgId: string, enabled: boolean) {
	const qc = useQueryClient();
	const navigate = useNavigate();
	const [phase, setPhase] = useState<"idle" | "confirming" | "slow">(
		enabled ? "confirming" : "idle"
	);
	useEffect(() => {
		if (!enabled) return;
		let cancelled = false;
		const start = Date.now();
		void (async () => {
			while (!cancelled && Date.now() - start < CONFIRM_WINDOW_MS) {
				const r = await safeAsync(syncBillingFn());
				if (cancelled) return;
				if (r.success && !r.data.locked) {
					await qc.invalidateQueries({ queryKey: billingKeys.all(orgId) });
					await navigate({ to: "/dashboard" });
					return;
				}
				await new Promise((ok) => setTimeout(ok, CONFIRM_POLL_MS));
			}
			if (cancelled) return;
			setPhase("slow");
			await navigate({ to: "/locked", search: {}, replace: true });
		})();
		return () => {
			cancelled = true;
		};
	}, [enabled, orgId, qc, navigate]);
	return phase;
}

function OrgEscapes() {
	const { data: organizations } = authClient.useListOrganizations();
	const actor = useActor();
	const switchOrganization = useSwitchOrganization();
	const others = organizations?.filter((o) => o.id !== actor?.organizationId) ?? [];

	return (
		<div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
			<DropdownMenu>
				<DropdownMenuTrigger render={<Button variant="outline" disabled={others.length === 0} />}>
					<Users /> Switch organization
				</DropdownMenuTrigger>
				<DropdownMenuContent className="min-w-56" align="center">
					<DropdownMenuGroup>
						<DropdownMenuLabel className="text-xs text-muted-foreground">
							Organizations
						</DropdownMenuLabel>
						{others.map((o) => (
							<DropdownMenuItem
								key={o.id}
								className="gap-2 p-2"
								onClick={() => switchOrganization(o.id)}
							>
								<Building className="size-4" aria-hidden />
								{o.name}
							</DropdownMenuItem>
						))}
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>
			<Button variant="outline" render={<Link to={ONBOARDING_CREATE_PATH} />} nativeButton={false}>
				<Plus /> Create organization
			</Button>
			<Button
				variant="ghost"
				onClick={async () => {
					await authClient.signOut();
					window.location.href = loginHref();
				}}
			>
				<LogOut /> Sign out
			</Button>
		</div>
	);
}

function DeleteOrganizationDialog({ name }: { name: string }) {
	const [open, setOpen] = useState(false);
	const deleteOrg = useDeleteOrganization();
	return (
		<ConfirmDialog
			open={open}
			onOpenChange={setOpen}
			trigger={
				<Button variant="ghost" size="sm" className="text-destructive">
					Delete organization
				</Button>
			}
			title={`Delete ${name}?`}
			description="This permanently deletes the organization and all its data, including members and profiles. The subscription is canceled with no refund. This cannot be undone."
			confirmLabel="Delete"
			destructive
			onConfirm={() => deleteOrg.mutate(undefined, { onSuccess: () => setOpen(false) })}
			isPending={deleteOrg.isPending}
		/>
	);
}

function LeaveOrganizationDialog({ name }: { name: string }) {
	const [open, setOpen] = useState(false);
	const leave = useLeaveOrganization();
	return (
		<ConfirmDialog
			open={open}
			onOpenChange={setOpen}
			trigger={
				<Button variant="outline">
					<LogOut /> Leave organization
				</Button>
			}
			title={`Leave ${name}?`}
			description="You lose access to this organization. An admin or owner must invite you again to rejoin."
			confirmLabel="Leave"
			destructive
			onConfirm={() => leave.mutate(undefined, { onSuccess: () => setOpen(false) })}
			isPending={leave.isPending}
		/>
	);
}

const transferSchema = z.object({ memberId: z.string().min(1, "Pick a member") });

function TransferOwnershipDrawer({ orgId }: { orgId: string }) {
	const [open, setOpen] = useState(false);
	const actor = useActor();
	const { data, isLoading } = useQuery({ ...orgMembersQuery(orgId), enabled: open });
	const transfer = useTransferOwnership();
	const form = useForm({ resolver: zodResolver(transferSchema), defaultValues: { memberId: "" } });

	const members = data?.members ?? [];
	const self = members.find((m) => m.userId === actor?.userId);
	const candidates = members.filter((m) => m.userId !== actor?.userId && !m.role.includes("owner"));
	const items = Object.fromEntries(candidates.map((m) => [m.id, m.user.name || m.user.email]));

	const onSubmit = ({ memberId }: { memberId: string }) => {
		if (!self) return;
		transfer.mutate(
			{ memberId, selfMemberId: self.id },
			{
				onSuccess: () => {
					form.reset();
					setOpen(false);
				},
			}
		);
	};

	return (
		<FormDrawer
			open={open}
			onOpenChange={(next) => !transfer.isPending && setOpen(next)}
			trigger={
				<Button variant="ghost" size="sm">
					Transfer ownership
				</Button>
			}
			title="Transfer ownership"
			description="The member becomes an owner and you become an admin. The new owner manages billing."
			form={form}
			onSubmit={onSubmit}
			submitLabel={
				<>
					<Check /> Transfer
				</>
			}
			isPending={transfer.isPending}
		>
			{!isLoading && candidates.length === 0 ? (
				<p className="text-sm text-muted-foreground">No other members to transfer to.</p>
			) : (
				<FormField
					control={form.control}
					name="memberId"
					render={({ field }) => (
						<FormItem>
							<FormLabel>New owner</FormLabel>
							<Select items={items} onValueChange={field.onChange} value={field.value}>
								<FormControl>
									<SelectTrigger className="w-full">
										<SelectValue placeholder={isLoading ? "Loading..." : "Select a member"} />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									{candidates.map((m) => (
										<SelectItem key={m.id} value={m.id}>
											{items[m.id]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<FormMessage />
						</FormItem>
					)}
				/>
			)}
		</FormDrawer>
	);
}
