import { db } from "@/db";
import { makeProfileChanges, type ProfileChangesDeps, type Via } from "@/domain/profileChanges";
import { purgeBlobsAfterResponse } from "./blobPurge";
import { limits } from "./limits";

const deps: ProfileChangesDeps = {
	db,
	limits,
	purgeBlobs: purgeBlobsAfterResponse,
};

/** Production wiring of the profile mutation seam: D1 + Member limit + Blob byte deletes. */
export const profileChanges = makeProfileChanges(deps);

/** The same seam as seen through one AI Client Connection: stamps `via` on what it writes. */
export const profileChangesVia = (via: Via) => makeProfileChanges({ ...deps, via });
