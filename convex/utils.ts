import { MutationCtx, QueryCtx } from "./_generated/server";
import { authComponent } from "./auth";

export async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
  const userMetadata = await authComponent.getAuthUser(ctx);

  if (!userMetadata) {
    return null;
  }
  const user = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", userMetadata.email))
    .first();

  if (!user) {
    return null;
  }

  return {
    user: user,
    metadata: userMetadata,
  };
}

export function makeTitleCase(str: string) {
  if (str.length === 0) return str;
  return str.trim().charAt(0).toUpperCase() + str.trim().slice(1).toLowerCase();
}
