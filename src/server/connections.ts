import { createServerFn } from "@tanstack/react-start";
import z from "zod";
import { db } from "@/db";
import { AppError } from "@/domain/errors";
import { listConnections, revokeConnection } from "@/domain/queries/connections";
import { captureMcpConnectionRevoked } from "@/lib/posthog-server";
import { authMiddleware } from "@/middleware/auth";

/** The caller's own Connections across all their communities (filtering is client-side). */
export const getMyConnections = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(({ context }) => listConnections(db, context.userId));

/** Revoke one of the caller's own Connections: consent + its tokens, effective immediately. */
export const revokeMyConnection = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(z.object({ id: z.string().trim().min(1) }))
	.handler(async ({ context, data }) => {
		const ended = await revokeConnection(db, context.userId, data.id);
		if (!ended) throw new AppError("NotFound", "Connection not found");
		captureMcpConnectionRevoked({
			userId: context.userId,
			organizationId: ended.orgId,
			clientId: ended.clientId,
		});
		return { ok: true as const };
	});
