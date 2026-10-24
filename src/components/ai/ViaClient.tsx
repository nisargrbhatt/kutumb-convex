import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Attribution byline: "via <AI Client>" for a change/request made through a Connection.
 * Renders nothing for in-app changes (`name` null). Name is the snapshot taken at the time.
 */
export function ViaClient({ name, className }: { name: string | null; className?: string }) {
	if (!name) return null;
	return (
		<span
			className={cn(
				"inline-flex max-w-full min-w-0 items-center gap-1 text-xs text-muted-foreground",
				className
			)}
		>
			<Bot aria-hidden className="size-3.5 shrink-0" />
			<span className="truncate">via {name}</span>
		</span>
	);
}
