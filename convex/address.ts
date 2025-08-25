import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./utils";

export const listMyAddress = query({
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

    const addresses = await ctx.db
      .query("address")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .collect();

    return addresses;
  },
});

export const addAddress = mutation({
  args: {
    line1: v.string(),
    line2: v.optional(v.string()),
    country: v.string(),
    state: v.string(),
    city: v.string(),
    postalCode: v.string(),
    type: v.union(v.literal("home"), v.literal("work"), v.literal("other")),
    note: v.optional(v.string()),
    digipin: v.string(),
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

    const address = await ctx.db.insert("address", {
      ...args,
      profileId: profile._id,
    });

    return address;
  },
});

export const deleteAddress = mutation({
  args: {
    addressId: v.id("address"),
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

    await ctx.db.delete(args.addressId);
  },
});
