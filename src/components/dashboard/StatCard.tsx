import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

type StatCardProps = {
	title: string;
	value: number;
	icon: LucideIcon;
};

export function StatCard({ title, value, icon: Icon }: StatCardProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-muted-foreground">{title}</CardTitle>
				<Icon className="col-start-2 row-span-2 row-start-1 size-4 self-start justify-self-end text-muted-foreground" />
			</CardHeader>
			<CardContent>
				<span className="font-heading text-2xl font-semibold">{value}</span>
			</CardContent>
		</Card>
	);
}
