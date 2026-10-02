import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Eye } from "lucide-react";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { MCP_DOCS_PATH, mcpClients } from "@/domain/mcpClients";
import { mcpUrlQuery } from "@/queries/mcpInfo";
import { CopyButton } from "./CopyButton";
import { McpClientSteps } from "./McpClientSteps";

/** Right-side drawer: MCP URL + copy, per-client setup accordion, read-only note, guide link. */
export function ConnectAiClientDrawer({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { data: mcpUrl } = useQuery({ ...mcpUrlQuery(), enabled: open });

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
			>
				<SheetHeader className="border-b pr-12">
					<SheetTitle>Connect AI client</SheetTitle>
					<SheetDescription>
						Add Kutumb to your AI client, sign in, pick a community and allow.
					</SheetDescription>
				</SheetHeader>
				<ScrollArea className="min-h-0 flex-1">
					<div className="flex flex-col gap-5 p-6">
						<div className="flex flex-col gap-1.5">
							<span className="text-sm font-medium">MCP URL</span>
							{mcpUrl ? (
								<div className="flex min-w-0 items-center gap-1 rounded-lg border bg-muted/40 py-1 pr-1 pl-3">
									<code className="min-w-0 flex-1 truncate text-xs" title={mcpUrl}>
										{mcpUrl}
									</code>
									<CopyButton value={mcpUrl} label="MCP URL" />
								</div>
							) : (
								<Skeleton className="h-10 w-full" />
							)}
						</div>
						{mcpUrl ? (
							<Accordion>
								{mcpClients(mcpUrl).map((client) => (
									<AccordionItem key={client.id} value={client.id}>
										<AccordionTrigger>{client.name}</AccordionTrigger>
										<AccordionContent>
											<McpClientSteps client={client} />
										</AccordionContent>
									</AccordionItem>
								))}
							</Accordion>
						) : null}
						<Alert>
							<Eye />
							<AlertTitle>Read-only</AlertTitle>
							<AlertDescription>
								AI clients can only read data you can already see. They can't change anything.
							</AlertDescription>
						</Alert>
						<Link
							to={MCP_DOCS_PATH}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-1 text-sm underline underline-offset-4"
						>
							Setup guide
							<ExternalLink className="size-3.5" />
						</Link>
					</div>
				</ScrollArea>
			</SheetContent>
		</Sheet>
	);
}
