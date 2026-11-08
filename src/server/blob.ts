import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { db } from "@/db";
import { discardUploadsInput, makeBlobStore, startUploadInput } from "@/domain/blobStore";
import { generatePrimaryKey } from "@/lib/generate";
import { limits } from "@/lib/limits";
import { orgMiddleware } from "@/middleware/org";

const store = () =>
	makeBlobStore({
		db,
		bucket: env.BLOBS,
		limits,
		now: () => new Date(),
		newId: generatePrimaryKey,
	});

/** Upload step 1: reserve a `pending` Blob; the browser then `PUT`s each variant to its URL. */
export const startUpload = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.validator(startUploadInput)
	.handler(({ context, data }) => store().start(context.actor, data));

/** Drops the Actor's own `pending` Blobs (Drawer closed without saving, or a file removed). */
export const discardUploads = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.validator(discardUploadsInput)
	.handler(({ context, data }) => store().discard(context.actor, data.blobIds));
