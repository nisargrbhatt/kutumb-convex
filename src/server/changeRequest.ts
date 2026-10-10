import { createServerFn } from "@tanstack/react-start";
import z from "zod";
import { db } from "@/db";
import { CHANGE_REQUEST_KIND, CHANGE_REQUEST_STATUS } from "@/db/constants";
import { assertCan } from "@/domain/permission";
import { profileChanges } from "@/lib/profileChanges";
import { orgMiddleware } from "@/middleware/org";

const changeRequestId = z.string().trim().min(1, "Change Request is required");

/** Owner/admin approve (optional note) or reject (reason required). */
export const reviewChangeRequest = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.validator(
		z.object({
			changeRequestId,
			review: z.discriminatedUnion("decision", [
				z.object({ decision: z.literal("approve"), note: z.string().max(500).nullish() }),
				z.object({
					decision: z.literal("reject"),
					note: z.string().trim().min(1, "Reason is required").max(500),
				}),
			]),
		})
	)
	.handler(({ context, data }) =>
		profileChanges.review(context.actor, data.changeRequestId, data.review)
	);

/** Submitter takes back their pending request. */
export const withdrawChangeRequest = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.validator(z.object({ changeRequestId }))
	.handler(({ context, data }) => profileChanges.withdraw(context.actor, data.changeRequestId));

/** Owner/admin: the pending create request judging a draft (null when none). */
export const getPendingCreateRequest = createServerFn({ method: "GET" })
	.middleware([orgMiddleware])
	.validator(z.object({ profileId: z.string().trim().min(1) }))
	.handler(async ({ context, data }) => {
		assertCan(context.actor, { changeRequest: ["review"] });
		const row = await db.query.changeRequest.findFirst({
			where: (f, o) =>
				o.and(
					o.eq(f.organizationId, context.actor.organizationId),
					o.eq(f.profileId, data.profileId),
					o.eq(f.kind, CHANGE_REQUEST_KIND.create),
					o.eq(f.status, CHANGE_REQUEST_STATUS.pending)
				),
			columns: { id: true, submitterName: true, createdAt: true },
		});
		return row ?? null;
	});
