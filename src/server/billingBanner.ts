import { createServerFn } from "@tanstack/react-start";
import { loadBanner } from "@/lib/billingBanner";
import { orgMiddlewareAllowLocked } from "@/middleware/org";

/** Banner above `_community` pages, any role. Copy only: admins / members never get prices. */
export const getBannerFn = createServerFn({ method: "GET" })
	.middleware([orgMiddlewareAllowLocked])
	.handler(({ context }) => loadBanner(context.actor.organizationId, context.actor.role));
