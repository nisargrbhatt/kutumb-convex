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
import { PENDING_REQUEST_LIMIT } from "@/domain/limits";
import { CREATE_DAILY_LIMIT, WRITE_BURST_LIMIT, WRITE_DAILY_LIMIT } from "@/domain/mcpQuota";
import { mcpUrlQuery } from "@/queries/mcpInfo";

const TITLE = "Connect an AI client — Kutumb";
const DESCRIPTION =
	"Connect Claude, ChatGPT, Claude Code or Cursor to your Kutumb community over MCP. Read only or read and make changes, revocable any time.";

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

const READ_TOOLS = [
	[
		"whoami",
		"who you are, your community, your role, your custom fields and whether you can write",
	],
	["list_custom_fields", "the custom fields your community tracks, with id, label and type"],
	[
		"search_profiles",
		"find members by name, gender, blood group, birth dates, city, state, country, living or deceased and custom field values",
	],
	[
		"count_profiles",
		"count members with the same filters, or split the count by gender, city, blood group, birth decade or a custom field",
	],
	["get_profile", "one member's details, addresses, custom fields and relations"],
	["get_family_graph", "the family tree around a member"],
] as const;

const WRITE_TOOLS = [
	["create_profile", "add a new member (searches for duplicates first)"],
	["update_profile", "change a member's details and custom field values"],
	["add_relation", "link two members, such as parent, sibling or spouse"],
	["remove_relation", "remove a relation you added from a member's side"],
	["add_address", "add an address to a member"],
	["update_address", "change an address"],
	["remove_address", "remove an address"],
] as const;

const READ_PROMPTS = [
	"What custom fields does our community track?",
	"Who in Pune has blood group O+ and is a volunteer?",
	"How many living members do we have in each city?",
	"How many members were born in the 1990s?",
	"Show me Jared's family tree.",
] as const;

const WRITE_PROMPTS = [
	"Add a new address for my uncle Ravi: 12 MG Road, Pune, Maharashtra, India, 411001.",
	"Update my cousin Meera's blood group to B+.",
	"Meera is Ravi's daughter. Add that relation.",
	"Create a profile for my newborn niece Anaya, born 2026-09-03.",
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
					exactly what you see in Kutumb, including contact details and custom fields. By default it
					is read only and cannot change anything.
				</p>
				<ul className="flex flex-col gap-1.5 pl-5">
					{READ_TOOLS.map(([name, what]) => (
						<li key={name} className="list-disc">
							<code className="text-sm">{name}</code>: {what}
						</li>
					))}
				</ul>
				<p className="text-sm text-muted-foreground">
					Deceased members are included unless you ask for living ones, so say "living" or "alive"
					for current questions. Dates are written as YYYY-MM-DD.
				</p>
			</section>

			<section className="flex flex-col gap-3" aria-labelledby="write">
				<h2 id="write" className="text-xl font-semibold">
					Letting the AI make changes
				</h2>
				<p className="text-muted-foreground">
					When a client asks for access, the Kutumb consent screen shows "What can the client do?"
					with two choices. <b>Read only</b> is the default. Choose <b>Read and make changes</b> to
					also let the client edit your community. You can pick Read only and still use every read
					tool above.
				</p>
				<ul className="flex flex-col gap-1.5 pl-5">
					{WRITE_TOOLS.map(([name, what]) => (
						<li key={name} className="list-disc">
							<code className="text-sm">{name}</code>: {what}
						</li>
					))}
				</ul>
				<p className="text-sm text-muted-foreground">
					Changes go through the same rules as in the Kutumb app. The client can only change one
					thing at a time, and it cannot delete a profile, review requests or edit your custom field
					definitions. Most clients ask you to confirm before each change.
				</p>

				<h3 className="mt-2 text-lg font-semibold">What happens to a change</h3>
				<ul className="flex flex-col gap-1.5 pl-5">
					<li className="list-disc">
						<b>Owner or admin</b>: the change is applied right away.
					</li>
					<li className="list-disc">
						<b>Member</b>: changing your own linked profile applies right away. Changing anyone
						else's becomes a change request. It is not live until an owner or admin approves it, and
						the AI will tell you so. Track it in your requests in Kutumb. Members can have at most{" "}
						{PENDING_REQUEST_LIMIT} pending requests.
					</li>
					<li className="list-disc">
						Creating a profile first checks for someone with the same name. If it finds a likely
						duplicate it writes nothing and asks you whether it is the same person.
					</li>
					<li className="list-disc">
						Changes made by an AI show "via" the client's name, such as "via Claude", under the
						submitter in Reviews, History and your requests.
					</li>
				</ul>

				<h3 className="mt-2 text-lg font-semibold">Limits</h3>
				<p className="text-muted-foreground">
					To stop runaway clients, each connection can make at most {WRITE_BURST_LIMIT} change calls
					per minute and {WRITE_DAILY_LIMIT} changes (applied or requested) per rolling 24 hours, of
					which at most {CREATE_DAILY_LIMIT} can be new profiles. If a limit is hit, the AI is told
					when it resets. Reading is not affected.
				</p>

				<h3 className="mt-2 text-lg font-semibold">Make a connection read only</h3>
				<p className="text-muted-foreground">
					Open Profile → AI in Kutumb, choose Manage on a connection and select Make read only. The
					client loses its change tools on its next call, with no need to reconnect.
				</p>

				<h3 className="mt-2 text-lg font-semibold">Upgrade to make changes</h3>
				<p className="text-muted-foreground">
					Connections made as Read only, and every connection created before this feature, stay read
					only. To allow changes, remove Kutumb in your AI app, add it again and choose Read and
					make changes on the consent screen.
				</p>

				<h3 className="mt-2 text-lg font-semibold">Community owners</h3>
				<p className="text-muted-foreground">
					The owner can turn AI changes off for the whole community in Settings → AI. Change tools
					then disappear for every member on their next call, whatever they chose when connecting.
					Requests the AI already submitted stay in Reviews. Turn it back on to let members with a
					Read and make changes connection write again.
				</p>
			</section>

			<section className="flex flex-col gap-3" aria-labelledby="prompts">
				<h2 id="prompts" className="text-xl font-semibold">
					Example prompts
				</h2>
				<h3 className="text-lg font-semibold">Look things up</h3>
				<ul className="flex flex-col gap-1.5 pl-5">
					{READ_PROMPTS.map((prompt) => (
						<li key={prompt} className="list-disc">
							"{prompt}"
						</li>
					))}
				</ul>
				<h3 className="mt-2 text-lg font-semibold">Make changes</h3>
				<p className="text-sm text-muted-foreground">
					Needs a Read and make changes connection. Be specific about who you mean, and the AI will
					look them up before changing anything.
				</p>
				<ul className="flex flex-col gap-1.5 pl-5">
					{WRITE_PROMPTS.map((prompt) => (
						<li key={prompt} className="list-disc">
							"{prompt}"
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
