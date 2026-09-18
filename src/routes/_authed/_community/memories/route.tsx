import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock } from "lucide-react";

import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { SidebarTrigger } from "@/components/ui/sidebar";

export const Route = createFileRoute("/_authed/_community/memories")({
	component: RouteComponent,
});

function PageHeader() {
	return (
		<div className="flex flex-row items-center justify-start gap-2">
			<SidebarTrigger />
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink render={<Link to={"/dashboard"} />}>Home</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>Memories</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
		</div>
	);
}

function RouteComponent() {
	return (
		<div className="flex h-full w-full flex-col items-start justify-start gap-4 p-2">
			<PageHeader />
			<Empty className="flex-1">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Clock />
					</EmptyMedia>
					<EmptyTitle>Coming soon</EmptyTitle>
					<EmptyDescription>Memories isn't available yet. Check back later.</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</div>
	);
}
