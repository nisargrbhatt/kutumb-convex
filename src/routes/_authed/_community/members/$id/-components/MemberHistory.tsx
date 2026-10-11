import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ActionFilter, actionsFor } from "@/components/audit/AuditFilters";
import { AuditHistory } from "@/components/audit/AuditHistory";
import { profileHistoryQuery } from "@/queries/audit";

/** Owner/admin History tab: this profile as subject or counterpart, category filter. */
export function MemberHistory({ orgId, profileId }: { orgId: string; profileId: string }) {
	const [category, setCategory] = useState("");
	const query = useInfiniteQuery(
		profileHistoryQuery(orgId, profileId, { actions: actionsFor(category) })
	);

	return (
		<div className="flex w-full flex-col gap-3">
			<div className="flex flex-wrap items-end justify-between gap-2">
				<div>
					<h2 className="text-lg font-medium">History</h2>
					<p className="text-sm text-muted-foreground">
						Every change to this profile, grouped by request.
					</p>
				</div>
				<ActionFilter value={category} onChange={setCategory} className="w-full sm:w-44" />
			</div>
			<AuditHistory
				groups={query.data?.pages.flatMap((p) => p.groups) ?? []}
				isLoading={query.isPending}
				hasNextPage={query.hasNextPage}
				isFetchingNextPage={query.isFetchingNextPage}
				onLoadMore={() => void query.fetchNextPage()}
				emptyText={category ? "No matching changes." : "No changes recorded yet."}
			/>
		</div>
	);
}
