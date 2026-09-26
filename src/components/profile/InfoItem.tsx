import type { ReactNode } from "react";

export function InfoItem({
	label,
	value,
	icon,
}: {
	label: string;
	value: ReactNode;
	icon?: ReactNode;
}) {
	return (
		<div className="flex min-w-0 flex-col gap-1.5">
			<span className="flex items-center gap-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
				{icon ? <span className="opacity-60 [&>svg]:size-3.5">{icon}</span> : null}
				{label}
			</span>
			<span className="text-sm font-medium break-words text-foreground">{value ?? "-"}</span>
		</div>
	);
}
