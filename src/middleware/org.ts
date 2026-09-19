import { createMiddleware } from "@tanstack/react-start";
import { db } from "@/db";
import { authMiddleware } from "@/middleware/auth";
import { AppError } from "@/domain/errors";
import type { Role } from "@/domain/permission";

export const orgMiddleware = createMiddleware()
	.middleware([authMiddleware])
	.server(async ({ next, context }) => {
		const organizationId = context.session.session.activeOrganizationId;

		if (typeof organizationId !== "string") {
			throw new AppError("NoActiveOrg");
		}

		const m = await db.query.member.findFirst({
			where: (f, o) =>
				o.and(o.eq(f.organizationId, organizationId), o.eq(f.userId, context.userId)),
			columns: { role: true },
		});

		if (!m) {
			throw new AppError("Forbidden", "Not a member of the active organization");
		}

		return next({
			context: {
				actor: { userId: context.userId, organizationId, role: m.role as Role },
			},
		});
	});
