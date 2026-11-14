import { env, waitUntil } from "cloudflare:workers";
import { db } from "@/db";
import { purgeBlobs } from "@/domain/blobStore";
import type { PurgeBlobs } from "@/domain/queries/postBase";

/**
 * Production Blob byte delete: after the batch, outside the response, so it never delays or fails
 * the write. Server only.
 */
export const purgeBlobsAfterResponse: PurgeBlobs = async (organizationId, blobs) =>
	waitUntil(purgeBlobs({ db, bucket: env.BLOBS }, organizationId, blobs));
