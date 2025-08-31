import { convexAdapter } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { requireEnv } from "@convex-dev/better-auth/utils";
import { betterAuth, BetterAuthOptions } from "better-auth";
import { betterAuthComponent } from "../convex/auth";
import { type GenericCtx } from "../convex/_generated/server";

const siteUrl = requireEnv("SITE_URL");

const createOptions = (ctx: GenericCtx) =>
  ({
    baseURL: siteUrl,
    database: convexAdapter(ctx, betterAuthComponent),
    account: {
      accountLinking: {
        enabled: true,
        allowDifferentEmails: true,
      },
    },
    plugins: [],
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID as string,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        accessType: "offline",
        prompt: "select_account+consent",
      },
    },
  }) satisfies BetterAuthOptions;

export const createAuth = (ctx: GenericCtx) => {
  const options = createOptions(ctx);
  return betterAuth({
    ...options,
    plugins: [
      ...options.plugins,
      // Pass in options so plugin schema inference flows through. Only required
      // for plugins that customize the user or session schema.
      // See "Some caveats":
      // https://www.better-auth.com/docs/concepts/session-management#customizing-session-response
      convex({ options }),
    ],
  });
};
