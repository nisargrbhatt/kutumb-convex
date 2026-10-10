import { db } from "@/db";
import { makeProfileChanges } from "@/domain/profileChanges";
import { invalidateOrgGraph } from "./communityGraphCache";
import { limits } from "./limits";

/** Production wiring of the profile mutation seam: D1 + Member limit + KV graph invalidation. */
export const profileChanges = makeProfileChanges({
	db,
	limits,
	onGraphChanged: invalidateOrgGraph,
});
