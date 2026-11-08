import { env, waitUntil } from "cloudflare:workers";
import { db } from "@/db";
import { purgeBlobs } from "@/domain/blobStore";
import { makeProfileChanges, type ProfileChangesDeps, type Via } from "@/domain/profileChanges";
import { limits } from "./limits";

const deps: ProfileChangesDeps = {
	db,
	limits,
	// After the batch, outside the response: never delays or fails the change.
	purgeBlobs: async (organizationId, blobs) =>
		waitUntil(purgeBlobs({ db, bucket: env.BLOBS }, organizationId, blobs)),
};

/** Production wiring of the profile mutation seam: D1 + Member limit + Blob byte deletes. */
export const profileChanges = makeProfileChanges(deps);

/** The same seam as seen through one AI Client Connection: stamps `via` on what it writes. */
export const profileChangesVia = (via: Via) => makeProfileChanges({ ...deps, via });
