import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import { polarClient } from "@polar-sh/better-auth/client";
import { stripeClient } from "@better-auth/stripe/client";

export const authClient = createAuthClient({
	plugins: [organizationClient(), polarClient(), stripeClient()],
});
