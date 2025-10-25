import {
  AuthFunctions,
  createClient,
  GenericCtx,
} from "@convex-dev/better-auth";
import { components, internal } from "./_generated/api";
import { query } from "./_generated/server";
import { DataModel } from "./_generated/dataModel";
import { betterAuth } from "better-auth";
import { convex } from "@convex-dev/better-auth/plugins";

const authFunctions: AuthFunctions = internal.auth;

export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    user: {
      onCreate: async (ctx, authUser) => {
        const existingUser = await ctx.db
          .query("users")
          .withIndex("email", (q) => q.eq("email", authUser.email))
          .first();

        if (!existingUser) {
          await ctx.db.insert("users", {
            email: authUser.email,
            image: authUser?.image ?? undefined,
            name: authUser?.name,
            role: "member",
            emailVerified: authUser?.emailVerified ?? false,
          });
        }
      },
      onUpdate: async (ctx, newDoc) => {
        const existingUser = await ctx.db
          .query("users")
          .withIndex("email", (q) => q.eq("email", newDoc.email))
          .first();

        if (existingUser) {
          await ctx.db.patch(existingUser._id, {
            image: newDoc?.image ?? undefined,
            name: newDoc?.name,
          });
        }
      },
      onDelete: async (ctx, authUser) => {
        const existingUser = await ctx.db
          .query("users")
          .withIndex("email", (q) => q.eq("email", authUser.email))
          .first();

        if (existingUser) {
          await ctx.db.delete(existingUser._id);
        }
      },
    },
  },
});

export const { onCreate, onDelete, onUpdate } = authComponent.triggersApi();

export const createAuth = (
  ctx: GenericCtx<DataModel>,
  { optionsOnly } = { optionsOnly: false },
) => {
  return betterAuth({
    baseURL: process.env.SITE_URL!,
    database: authComponent.adapter(ctx),
    account: {
      accountLinking: {
        enabled: true,
        allowDifferentEmails: true,
      },
    },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID as string,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        accessType: "offline",
        prompt: "select_account consent",
      },
    },
    logger: {
      disabled: optionsOnly,
    },
    trustedOrigins: [process.env.SITE_URL!],
    plugins: [convex()],
  });
};

// Example function for getting the current user
// Feel free to edit, omit, etc.
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const userMetadata = await authComponent.getAuthUser(ctx);

    if (!userMetadata) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", userMetadata.email))
      .first();

    return {
      ...user,
      ...userMetadata,
    };
  },
});
