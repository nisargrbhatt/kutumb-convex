import type { McpClient } from "@/domain/mcpClients";
import { CopyButton } from "./CopyButton";

/** Ordered steps + copyable snippets for one AI Client. Shared by the drawer and the public guide. */
export function McpClientSteps({ client }: { client: McpClient }) {
	return (
		<div className="flex min-w-0 flex-col gap-3">
			<ol className="flex list-decimal flex-col gap-1.5 pl-5">
				{client.steps.map((step) => (
					<li key={step}>{step}</li>
				))}
			</ol>
			{client.snippets.map((s) => (
				<div key={s.label} className="min-w-0 rounded-lg border bg-muted/40">
					<div className="flex items-center justify-between border-b px-3 py-1">
						<span className="text-xs text-muted-foreground">{s.label}</span>
						<CopyButton value={s.code} label={s.label} />
					</div>
					<pre className="overflow-x-auto p-3 text-xs">
						<code>{s.code}</code>
					</pre>
				</div>
			))}
		</div>
	);
}
