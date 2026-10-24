import { db } from "@/db";
import { makeProfileChanges, type Via } from "@/domain/profileChanges";
import { limits } from "./limits";

/** Production wiring of the profile mutation seam: D1 + Member limit. */
export const profileChanges = makeProfileChanges({ db, limits });

/** The same seam as seen through one AI Client Connection: stamps `via` on what it writes. */
export const profileChangesVia = (via: Via) => makeProfileChanges({ db, limits, via });
