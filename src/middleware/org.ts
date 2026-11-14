import { createMiddleware } from "@tanstack/react-start";
import { db } from "@/db";
import { authMiddleware } from "@/middleware/auth";
import { AppError } from "@/domain/errors";
import { loadOrgMembership } from "@/domain/queries/orgLock";

/**
 * Active-org gate: member ⋈ `orgBilling` in one query (no KV: paying unlocks on the next
 * request). `allowLocked: false` is default-deny under Lock.
 */
const makeOrgMiddleware = ({ allowLocked }: { allowLocked: boolean }) =>
	createMiddleware()
		.middleware([authMiddleware])
		.server(async ({ next, context }) => {
			const organizationId = context.session.session.activeOrganizationId;

			if (typeof organizationId !== "string") {
				throw new AppError("NoActiveOrg");
			}

			const m = await loadOrgMembership(db, organizationId, context.userId, new Date());

			if (!m) {
				throw new AppError("Forbidden", "Not a member of the active organization");
			}
			if (m.lockReason && !allowLocked) {
				throw new AppError("Locked", m.lockReason, m.lockReason);
			}

			return next({
				context: {
					actor: { userId: context.userId, organizationId, role: m.role },
					lockReason: m.lockReason,
				},
			});
		});

/** Default for org-scoped server fns: throws `AppError("Locked")` on a Locked org. */
export const orgMiddleware = makeOrgMiddleware({ allowLocked: false });

/**
 * Lock-exempt variant. Only for: billing read / sync / checkout / portal / resume / invoice PDF,
 * delete org, transfer ownership, owner list for `/locked`.
 */
export const orgMiddlewareAllowLocked = makeOrgMiddleware({ allowLocked: true });
