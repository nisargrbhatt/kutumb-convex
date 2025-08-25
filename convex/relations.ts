import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./utils";

export const listMyRelations = query({
  args: {},
  handler: async (ctx) => {
    const identity = await getCurrentUser(ctx);
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const profile = await ctx.db
      .query("profile")
      .withIndex("by_userId", (q) => q.eq("userId", identity.user._id))
      .first();

    if (!profile) {
      throw new Error("No profile found");
    }

    const myRelations = await ctx.db
      .query("relations")
      .withIndex("by_fromProfileId", (q) => q.eq("fromProfileId", profile._id))
      .collect();

    const mentionedRelations = await ctx.db
      .query("relations")
      .withIndex("by_toProfileId", (q) => q.eq("toProfileId", profile._id))
      .collect();

    const relations = [...myRelations, ...mentionedRelations];

    const relationsList = await Promise.all(
      relations.map(async (relation) => {
        const toProfile = await ctx.db.get(relation.toProfileId);
        const fromProfile = await ctx.db.get(relation.fromProfileId);
        return {
          ...relation,
          toProfile,
          fromProfile,
        };
      }),
    );

    return relationsList;
  },
});

export const addMyRelation = mutation({
  args: {
    toProfileId: v.id("profile"),
    type: v.union(
      v.literal("brother"),
      v.literal("brother_in_law"),
      v.literal("child"),
      v.literal("father"),
      v.literal("father_in_law"),
      v.literal("mother"),
      v.literal("mother_in_law"),
      v.literal("sister"),
      v.literal("sister_in_law"),
      v.literal("wife"),
      v.literal("husband"),
      v.literal("uncle"),
      v.literal("aunt"),
    ),
    note: v.optional(v.string()),
    bloodRelation: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await getCurrentUser(ctx);
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const profile = await ctx.db
      .query("profile")
      .withIndex("by_userId", (q) => q.eq("userId", identity.user._id))
      .first();

    if (!profile) {
      throw new Error("No profile found");
    }

    const checkExistingRelation = await ctx.db
      .query("relations")
      .filter((q) =>
        q.or(
          q.and(
            q.eq(q.field("fromProfileId"), profile._id),
            q.eq(q.field("toProfileId"), args.toProfileId),
          ),
          q.and(
            q.eq(q.field("toProfileId"), profile._id),
            q.eq(q.field("fromProfileId"), args.toProfileId),
          ),
        ),
      )
      .first();

    if (checkExistingRelation) {
      throw new Error("Relation already exists");
    }

    const relationId = await ctx.db.insert("relations", {
      ...args,
      fromProfileId: profile._id,
    });

    return relationId;
  },
});

export const deleteMyRelation = mutation({
  args: {
    id: v.id("relations"),
  },
  handler: async (ctx, args) => {
    const identity = await getCurrentUser(ctx);
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const profile = await ctx.db
      .query("profile")
      .withIndex("by_userId", (q) => q.eq("userId", identity.user._id))
      .first();

    if (!profile) {
      throw new Error("No profile found");
    }

    const relation = await ctx.db.get(args.id);

    if (!relation) {
      throw new Error("No relation found");
    }

    if (relation.fromProfileId !== profile._id) {
      throw new Error("Can not delete relation added by other");
    }

    await ctx.db.delete(args.id);
  },
});
