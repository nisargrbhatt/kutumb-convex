import { db } from "@/db";
import { makeProfileChanges } from "@/domain/profileChanges";
import { limits } from "./limits";

/** Production wiring of the profile mutation seam: D1 + Member limit. */
export const profileChanges = makeProfileChanges({ db, limits });
