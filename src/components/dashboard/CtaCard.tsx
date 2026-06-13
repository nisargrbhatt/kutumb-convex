import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, type LinkProps } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

type CtaCardProps = {
	title: string;
	description: string;
	actionLabel: string;
	to: LinkProps["to"];
	icon: LucideIcon;
};

export function CtaCard({ title, description, actionLabel, to, icon: Icon }: CtaCardProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<Icon className="col-start-2 row-span-2 row-start-1 size-4 self-start justify-self-end text-muted-foreground" />
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent>
				<Button asChild size="sm">
					<Link to={to}>{actionLabel}</Link>
				</Button>
			</CardContent>
		</Card>
	);
}
