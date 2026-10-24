import { createServerFn } from "@tanstack/react-start";
import * as z from "zod";
import { db } from "@/db";
import { getAiClientWrites, setAiClientWrites } from "@/domain/queries/orgSettings";
import { captureAiClientWritesToggled } from "@/lib/posthog-server";
import { orgMiddleware } from "@/middleware/org";

/** Settings → AI: whether AI Clients may write here. Readable by any member (consent screen copy). */
export const getAiSettings = createServerFn({ method: "GET" })
	.middleware([orgMiddleware])
	.handler(async ({ context }) => ({
		aiClientWrites: await getAiClientWrites(db, context.actor.organizationId),
	}));

/** Owner-only (enforced in the domain fn). Takes effect on every AI Client's next call. */
export const setAiClientWritesFn = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.validator(z.object({ enabled: z.boolean() }))
	.handler(async ({ context, data }) => {
		await setAiClientWrites(db, context.actor, data.enabled);
		captureAiClientWritesToggled({
			userId: context.actor.userId,
			organizationId: context.actor.organizationId,
			enabled: data.enabled,
		});
		return { aiClientWrites: data.enabled };
	});
