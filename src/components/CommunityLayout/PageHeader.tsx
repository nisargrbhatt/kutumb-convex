import { Fragment, type ReactNode } from "react";
import { Link, type LinkProps } from "@tanstack/react-router";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";

export type Crumb = { label: string; to?: LinkProps["to"] };

const HOME: Crumb = { label: "Home", to: "/dashboard" };

/**
 * Sidebar trigger + breadcrumbs (Home is prepended) + optional title row.
 * Last crumb renders as the current page; omit `crumbs` on the dashboard itself.
 */
export function PageHeader({
	crumbs = [],
	title,
	description,
	actions,
}: {
	crumbs?: Crumb[];
	title?: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
}) {
	const all = [HOME, ...crumbs];

	return (
		<div className="flex w-full flex-col gap-4">
			<div className="flex min-w-0 flex-row items-center gap-2">
				<SidebarTrigger />
				<Breadcrumb className="min-w-0">
					<BreadcrumbList>
						{all.map((crumb, i) => {
							const isLast = i === all.length - 1;
							return (
								<Fragment key={`${i}-${crumb.label}`}>
									{i > 0 ? <BreadcrumbSeparator /> : null}
									<BreadcrumbItem className="min-w-0">
										{isLast || !crumb.to ? (
											<BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
										) : (
											<BreadcrumbLink render={<Link to={crumb.to} />}>{crumb.label}</BreadcrumbLink>
										)}
									</BreadcrumbItem>
								</Fragment>
							);
						})}
					</BreadcrumbList>
				</Breadcrumb>
			</div>
			{title || description || actions ? (
				<div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="min-w-0">
						{title ? <h1 className="text-lg font-medium">{title}</h1> : null}
						{description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
					</div>
					{actions ? (
						<div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}
