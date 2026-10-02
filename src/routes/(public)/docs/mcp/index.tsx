import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CopyButton } from "@/components/ai/CopyButton";
import { McpClientSteps } from "@/components/ai/McpClientSteps";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { mcpClients } from "@/domain/mcpClients";
import { mcpUrlQuery } from "@/queries/mcpInfo";

const TITLE = "Connect an AI client — Kutumb";
const DESCRIPTION =
	"Connect Claude, ChatGPT, Claude Code or Cursor to your Kutumb community over MCP. Read-only, revocable any time.";

export const Route = createFileRoute("/(public)/docs/mcp/")({
	head: () => ({
		meta: [
			{ title: TITLE },
			{ name: "description", content: DESCRIPTION },
			{ property: "og:title", content: TITLE },
			{ property: "og:description", content: DESCRIPTION },
		],
	}),
	loader: ({ context }) => context.queryClient.ensureQueryData(mcpUrlQuery()),
	component: McpDocsPage,
});

const TOOLS = [
	["whoami", "who you are, your community and role"],
	["search_profiles", "find members by name, status or gender"],
	["get_profile", "one member's details, addresses, custom fields and relations"],
	["get_family_graph", "the family tree around a member"],
] as const;

function McpDocsPage() {
	const { data: mcpUrl } = useSuspenseQuery(mcpUrlQuery());

	return (
		<article className="container mx-auto flex max-w-3xl flex-col gap-10 px-4 py-10 md:py-16">
			<header className="flex flex-col gap-4">
				<Breadcrumb>
					<BreadcrumbList>
						<BreadcrumbItem>
							<BreadcrumbLink render={<Link to="/" />}>Home</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem>Docs</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbPage>MCP</BreadcrumbPage>
						</BreadcrumbItem>
					</BreadcrumbList>
				</Breadcrumb>
				<h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Connect an AI client</h1>
				<p className="text-muted-foreground">
					Ask Claude, ChatGPT, Claude Code or Cursor about your community, like "who are Jared's
					sisters?" or "list members in Pune". Kutumb speaks MCP, so any client that supports remote
					MCP servers with OAuth works.
				</p>
			</header>

			<section className="flex flex-col gap-3" aria-labelledby="url">
				<h2 id="url" className="text-xl font-semibold">
					MCP URL
				</h2>
				<div className="flex min-w-0 items-center gap-1 rounded-lg border bg-muted/40 py-1 pr-1 pl-3">
					<code className="min-w-0 flex-1 overflow-x-auto text-sm whitespace-nowrap">{mcpUrl}</code>
					<CopyButton value={mcpUrl} label="MCP URL" />
				</div>
				<p className="text-sm text-muted-foreground">
					You need a Kutumb account. When prompted, sign in, pick one community, review what the
					client asks for and choose Allow.
				</p>
			</section>

			{mcpClients(mcpUrl).map((client) => (
				<section key={client.id} className="flex flex-col gap-3" aria-labelledby={client.id}>
					<h2 id={client.id} className="text-xl font-semibold">
						{client.name}
					</h2>
					<McpClientSteps client={client} />
				</section>
			))}

			<section className="flex flex-col gap-3" aria-labelledby="see">
				<h2 id="see" className="text-xl font-semibold">
					What the AI can see
				</h2>
				<p className="text-muted-foreground">
					The client acts as you, in the one community you picked, with your current role. It sees
					exactly what you see in Kutumb, including contact details and custom fields. It is
					read-only and cannot change anything.
				</p>
				<ul className="flex flex-col gap-1.5 pl-5">
					{TOOLS.map(([name, what]) => (
						<li key={name} className="list-disc">
							<code className="text-sm">{name}</code>: {what}
						</li>
					))}
				</ul>
			</section>

			<section className="flex flex-col gap-3" aria-labelledby="revoke">
				<h2 id="revoke" className="text-xl font-semibold">
					How to revoke
				</h2>
				<p className="text-muted-foreground">
					Open Profile → AI in Kutumb and revoke any connection. The client loses access
					immediately. Access also ends if you leave or are removed from the community, and an
					unused connection expires after 30 days. To use it again, reconnect from the client.
				</p>
				<p>
					<Link to="/profile/ai" className="text-sm underline underline-offset-4">
						Go to Profile → AI
					</Link>
				</p>
			</section>
		</article>
	);
}
