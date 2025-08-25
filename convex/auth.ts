import {
  AuthFunctions,
  BetterAuth,
  PublicAuthFunctions,
} from "@convex-dev/better-auth";
import { api, components, internal } from "./_generated/api";
import { query } from "./_generated/server";
import { DataModel, Id } from "./_generated/dataModel";

const authFunctions: AuthFunctions = internal.auth;
const publicAuthFunctions: PublicAuthFunctions = api.auth;

export const betterAuthComponent = new BetterAuth(components.betterAuth, {
  authFunctions,
  publicAuthFunctions,
  verbose: false,
});

export const {
  createUser,
  createSession,
  isAuthenticated,
  deleteUser,
  updateUser,
} = betterAuthComponent.createAuthFunctions<DataModel>({
  onCreateUser: async (ctx, user) => {
    // Example: copy the user's email to the application users table.
    // We'll use onUpdateUser to keep it synced.

    const userId = await ctx.db.insert("users", {
      email: user.email,
      image: user?.image ?? undefined,
      name: user?.name,
      role: "member",
      emailVerified: user?.emailVerified ?? false,
    });

    // This function must return the user id.
    return userId;
  },
  onDeleteUser: async (ctx, userId) => {
    // Delete the user's data if the user is being deleted
    await ctx.db.delete(userId as Id<"users">);
  },
  onUpdateUser: async (ctx, user) => {
    // Keep the user's email synced
    const userId = user.userId as Id<"users">;
    await ctx.db.patch(userId, {
      image: user?.image ?? undefined,
      name: user?.name,
    });
  },
});

// Example function for getting the current user
// Feel free to edit, omit, etc.
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const userMetadata = await betterAuthComponent.getAuthUser(ctx);

    if (!userMetadata) {
      return null;
    }

    const user = await ctx.db.get(userMetadata.userId as Id<"users">);

    return {
      ...user,
      ...userMetadata,
    };
  },
});
