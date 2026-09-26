import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { COMMUNITY_PROFILE_STATUS } from "@/db/constants";

type ProfileStatus = (typeof COMMUNITY_PROFILE_STATUS)[keyof typeof COMMUNITY_PROFILE_STATUS];

const STATUS_CLASS: Record<ProfileStatus, string> = {
	draft:
		"border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
	active:
		"border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
	inactive:
		"border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
};

export function ProfileStatusBadge({
	status,
	className,
}: {
	status: ProfileStatus | (string & {});
	className?: string;
}) {
	const tone = STATUS_CLASS[status as ProfileStatus] ?? STATUS_CLASS.draft;
	return (
		<Badge variant="outline" className={cn("capitalize", tone, className)}>
			{status}
		</Badge>
	);
}
