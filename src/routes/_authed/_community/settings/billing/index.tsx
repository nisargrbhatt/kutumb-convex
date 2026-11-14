import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CreditCard, Download, ExternalLink, Sparkles } from "lucide-react";
import z from "zod";
import { PageHeader } from "@/components/CommunityLayout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Progress } from "@/components/ui/progress";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { TRIAL_DAYS } from "@/domain/billing";
import {
	STATUS_BADGE,
	cancelAccessUntil,
	cardLabel,
	formatBillingDate,
	formatMoney,
	headline,
	invoiceStatusLabel,
	primaryAction,
	priceLabel,
} from "@/domain/billingCopy";
import { countryName } from "@/domain/countries";
import {
	billingPageQuery,
	useCancelSubscription,
	useOpenPortal,
	useResumeSubscription,
	useStartCheckout,
	useSyncBilling,
} from "@/queries/billing";
import type { BillingPage } from "@/lib/billing";

export const Route = createFileRoute("/_authed/_community/settings/billing/")({
	// `from=dodo`: back from Dodo's portal / checkout → pull the sub once, then drop the param.
	validateSearch: z.object({ from: z.literal("dodo").optional().catch(undefined) }),
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(billingPageQuery(context.organizationId));
	},
	head: () => ({ meta: [{ title: "Billing | Kutumb App" }] }),
	component: RouteComponent,
});

function RouteComponent() {
	const { organizationId: orgId } = Route.useRouteContext();
	const { from } = Route.useSearch();
	const navigate = Route.useNavigate();
	const { data } = useSuspenseQuery(billingPageQuery(orgId));
	const sync = useSyncBilling(orgId);

	const synced = useRef(false);
	useEffect(() => {
		if (from !== "dodo" || synced.current) return;
		synced.current = true;
		sync.mutate(undefined, {
			onSettled: () => navigate({ search: {}, replace: true }),
		});
	}, [from, sync, navigate]);

	return (
		<div className="flex h-full w-full flex-col items-start justify-start gap-4 p-2">
			<PageHeader
				crumbs={[{ label: "Settings", to: "/settings/overview" }, { label: "Billing" }]}
				title="Billing"
				description="One subscription for this organization. Only owners see this page."
			/>
			<div className="flex w-full max-w-3xl flex-col gap-4">
				<StatusCard orgId={orgId} page={data} />
				<div className="grid gap-4 md:grid-cols-2">
					<PaymentMethodCard page={data} />
					<BillingDetailsCard page={data} />
				</div>
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Invoices</CardTitle>
					</CardHeader>
					<CardContent>
						<InvoiceTable page={data} />
					</CardContent>
				</Card>
				<CancelZone orgId={orgId} page={data} />
			</div>
		</div>
	);
}

const copyContext = (page: BillingPage) => ({
	orgName: page.orgName,
	price: priceLabel(page.recurringPreTaxAmount),
});

function StatusCard({ orgId, page }: { orgId: string; page: BillingPage }) {
	const { access } = page;
	const h = headline(access, copyContext(page));
	const badge = STATUS_BADGE[access.state];
	return (
		<Card>
			<CardHeader>
				<div className="flex flex-wrap items-center gap-2">
					<CardTitle>{h.title}</CardTitle>
					<Badge variant={badge.tone}>{badge.badge}</Badge>
				</div>
				<CardDescription>{h.body}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				{access.state === "trialing" && access.trialDaysLeft !== undefined ? (
					<Progress
						aria-label="Trial progress"
						value={Math.min(100, ((TRIAL_DAYS - access.trialDaysLeft) / TRIAL_DAYS) * 100)}
					/>
				) : null}
				<div>
					<PrimaryButton orgId={orgId} page={page} className="w-full sm:w-auto" />
				</div>
			</CardContent>
		</Card>
	);
}

function PrimaryButton({
	orgId,
	page,
	className,
}: {
	orgId: string;
	page: BillingPage;
	className?: string;
}) {
	const portal = useOpenPortal();
	const checkout = useStartCheckout();
	const resume = useResumeSubscription(orgId);
	const action = primaryAction(page.access, copyContext(page));
	if (!action) return null;

	const run = { portal, checkout, resume }[action.kind];
	return (
		<Button
			className={className}
			variant={action.destructive ? "destructive" : "default"}
			disabled={run.isPending}
			onClick={() => run.mutate()}
		>
			{action.kind === "resume" ? <Sparkles /> : <CreditCard />} {action.label}
		</Button>
	);
}

function PaymentMethodCard({ page }: { page: BillingPage }) {
	const portal = useOpenPortal();
	const has = page.access.hasPaymentMethod;
	const label = page.paymentMethod
		? cardLabel(page.paymentMethod)
		: has
			? "Card on file"
			: "None added";
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Payment method</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-wrap items-center justify-between gap-2 text-sm">
				<span className="flex min-w-0 items-center gap-2">
					<CreditCard className="size-4 shrink-0" />
					<span className="truncate">{label}</span>
				</span>
				<Button
					size="sm"
					variant="outline"
					disabled={portal.isPending}
					onClick={() => portal.mutate()}
				>
					{has ? "Update" : "Add"} <ExternalLink />
				</Button>
			</CardContent>
		</Card>
	);
}

function BillingDetailsCard({ page }: { page: BillingPage }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Billing details</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-1 text-sm">
				<span className="break-words">
					Billed to {page.orgName} · {countryName(page.country)}
				</span>
				<span className="break-all text-muted-foreground">
					{page.receiptEmail ? `Receipts to ${page.receiptEmail}` : "Receipt email unavailable"}
				</span>
				<span className="text-muted-foreground">
					Standard · {priceLabel(page.recurringPreTaxAmount)}/month + applicable tax
				</span>
			</CardContent>
		</Card>
	);
}

function InvoiceTable({ page }: { page: BillingPage }) {
	if (page.invoices.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				{page.dodoUnavailable
					? "Invoices are unavailable right now. Try again in a minute."
					: "No invoices yet. Invoices appear here after each payment."}
			</p>
		);
	}
	return (
		<div className="w-full overflow-x-auto">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Date</TableHead>
						<TableHead>Amount</TableHead>
						<TableHead>Status</TableHead>
						<TableHead className="text-right">Invoice</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{page.invoices.map((inv) => (
						<TableRow key={inv.paymentId}>
							<TableCell>{formatBillingDate(inv.date)}</TableCell>
							<TableCell className="font-mono">{formatMoney(inv.amount, inv.currency)}</TableCell>
							<TableCell>
								<Badge variant={inv.status === "failed" ? "destructive" : "secondary"}>
									{invoiceStatusLabel(inv.status)}
								</Badge>
							</TableCell>
							<TableCell className="text-right">
								{inv.hasPdf ? (
									<Button
										size="sm"
										variant="ghost"
										nativeButton={false}
										render={
											// oxlint-disable-next-line jsx-a11y/anchor-has-content -- children come from Button
											<a
												href={`/api/billing/invoice/${encodeURIComponent(inv.paymentId)}`}
												target="_blank"
												rel="noopener"
												aria-label={`Invoice PDF, ${formatBillingDate(inv.date)}`}
											/>
										}
									>
										<Download /> PDF
									</Button>
								) : (
									<span className="text-muted-foreground">—</span>
								)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function CancelZone({ orgId, page }: { orgId: string; page: BillingPage }) {
	const [open, setOpen] = useState(false);
	const cancel = useCancelSubscription(orgId);
	const until = cancelAccessUntil(page.access);
	if (!until) return null;
	const copy = `You keep access until ${until}. Data is kept; re-subscribe any time.`;
	return (
		<div className="flex w-full flex-col gap-2 rounded-lg border border-destructive/50 p-4 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<h3 className="font-medium text-destructive">Cancel subscription</h3>
				<p className="text-sm text-muted-foreground">{copy}</p>
			</div>
			<ConfirmDialog
				open={open}
				onOpenChange={setOpen}
				trigger={
					<Button variant="outline" className="shrink-0">
						Cancel subscription
					</Button>
				}
				title="Cancel subscription?"
				description={copy}
				confirmLabel="Cancel subscription"
				destructive
				isPending={cancel.isPending}
				onConfirm={() => cancel.mutate(undefined, { onSuccess: () => setOpen(false) })}
			/>
		</div>
	);
}
