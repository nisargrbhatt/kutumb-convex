import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./utils";

export const createMemory = mutation({
  args: {
    title: v.string(),
    images: v.array(v.id("_storage")),
    content: v.string(),
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

    const memoryId = await ctx.db.insert("memories", {
      title: args.title,
      images: args.images,
      content: args.content,
      createdBy: profile._id,
    });

    return memoryId;
  },
});

export const getMyMemories = query({
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

    const memories = await ctx.db
      .query("memories")
      .withIndex("by_createdBy", (q) => q.eq("createdBy", profile._id))
      .collect();

    return memories;
  },
});

export const listMemories = query({
  handler: async (ctx) => {
    const identity = await getCurrentUser(ctx);
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const memories = await ctx.db
      .query("memories")
      .withIndex("by_creation_time")
      .order("desc")
      .take(50);

    const memoriesWithPictures = await Promise.all(
      memories.map(async (memory) => {
        const images = await Promise.all(
          memory.images.map((imageId) => ctx.storage.getUrl(imageId)),
        );

        const profile = await ctx.db.get(memory.createdBy);
        let profilePicture: string | null = null;
        if (profile?.picture) {
          profilePicture = await ctx.storage.getUrl(profile.picture);
        }

        return {
          ...memory,
          images,
          createdBy: profile
            ? {
                id: profile?._id,
                name: [
                  profile?.firstName,
                  profile?.middleName,
                  profile?.lastName,
                ]
                  .filter(Boolean)
                  .join(" "),
                picture: profilePicture,
              }
            : null,
        };
      }),
    );

    return memoriesWithPictures;
  },
});

export const generateMemoryUploadUrl = mutation({
  handler: async (ctx) => {
    const identity = await getCurrentUser(ctx);
    if (!identity) {
      throw new Error("Unauthorized");
    }
    return await ctx.storage.generateUploadUrl();
  },
});
