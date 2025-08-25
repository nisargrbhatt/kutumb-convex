import { Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";
import { betterAuthComponent } from "./auth";

export async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
  const userMetadata = await betterAuthComponent.getAuthUser(ctx);

  if (!userMetadata) {
    return null;
  }

  const user = await ctx.db.get(userMetadata.userId as Id<"users">);

  if (!user) {
    return null;
  }

  return {
    user: user,
    metadata: userMetadata,
  };
}
