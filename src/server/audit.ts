import { createServerFn } from "@tanstack/react-start";
import { db } from "@/db";
import { auditFilterSchema } from "@/domain/audit";
import { listAuditFacets, listAuditGroups } from "@/domain/queries/audit";
import { orgMiddleware } from "@/middleware/org";

/** Owner/admin: one page of audit groups (org log, or a profile's History via `profileId`). */
export const getAuditGroups = createServerFn({ method: "GET" })
	.middleware([orgMiddleware])
	.validator(auditFilterSchema)
	.handler(({ context, data }) => listAuditGroups(db, context.actor, data));

/** Owner/admin: Actor + profile options for the Audit log filters. */
export const getAuditFacets = createServerFn({ method: "GET" })
	.middleware([orgMiddleware])
	.handler(({ context }) => listAuditFacets(db, context.actor));
