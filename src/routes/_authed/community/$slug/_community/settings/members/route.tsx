import { createFileRoute } from "@tanstack/react-router";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { getOrganizationMemberListQuery } from "@/api/organizationMember";
import { useQuery } from "@tanstack/react-query";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { BookKeyIcon, CrownIcon, UserIcon } from "lucide-react";

export const Route = createFileRoute("/_authed/community/$slug/_community/settings/members")({
	component: RouteComponent,
	loader: async ({ context, params }) => {
		await context.queryClient.ensureQueryData(
			getOrganizationMemberListQuery({ slug: params.slug })
		);
	},
});

function PageHeader() {
	return (
		<div className="flex flex-row items-center justify-start gap-2">
			<SidebarTrigger />
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink asChild>
							<Route.Link to={"/community/$slug/dashboard"}>Home</Route.Link>
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbLink asChild>
							<Route.Link to={"/community/$slug/settings/overview"}>Settings</Route.Link>
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>Members</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
		</div>
	);
}

function OrganizationMemberList() {
	const { slug } = Route.useParams();
	const { data } = useQuery(getOrganizationMemberListQuery({ slug }));

	return (
		<div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
			{data?.map((member) => (
				<Item key={member.id} variant={"outline"}>
					<ItemMedia variant="icon">
						{member.role === "owner" ? <CrownIcon aria-label="Owner" /> : null}
						{member.role === "manager" ? <BookKeyIcon aria-label="Manager" /> : null}
						{member.role === "member" ? <UserIcon aria-label="Member" /> : null}
					</ItemMedia>
					<ItemContent>
						<ItemTitle>{member.member?.displayName}</ItemTitle>
						<ItemDescription>{member?.member?.email}</ItemDescription>
					</ItemContent>
				</Item>
			))}
		</div>
	);
}

function RouteComponent() {
	return (
		<div className="flex h-full w-full flex-col items-start justify-start gap-4 p-2">
			<PageHeader />
			<OrganizationMemberList />
		</div>
	);
}
