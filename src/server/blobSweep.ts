import { env } from "cloudflare:workers";
import { db } from "@/db";
import { makeBlobSweep } from "@/domain/blobSweep";

/** Hourly blob sweep wired to D1 and the `BLOBS` bucket. */
export const blobSweep = makeBlobSweep({ db, bucket: env.BLOBS, now: () => new Date() });
