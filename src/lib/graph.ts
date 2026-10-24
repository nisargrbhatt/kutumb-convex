import { env, waitUntil } from "cloudflare:workers";
import { db } from "@/db";
import { createGraphLru, getOrgGraphBlob, type OrgGraphBlob } from "@/domain/queries/graph";

// Module scope = one LRU per isolate (cap 10 orgs).
const lru = createGraphLru();

/** Production wiring of the versioned graph cache: D1 version + isolate LRU + KV. */
export const getOrgGraph = (organizationId: string): Promise<OrgGraphBlob> =>
	getOrgGraphBlob({ db, kv: env.KV, lru, waitUntil }, organizationId);
