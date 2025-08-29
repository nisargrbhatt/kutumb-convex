import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./utils";
import { Id } from "./_generated/dataModel";

export const getProfile = query({
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

    let picture: string | null = null;

    if (profile?.picture) {
      picture = await ctx.storage.getUrl(profile.picture);
    }

    return { profile: { ...profile, picture: picture }, user: identity.user };
  },
});

export const createMyProfile = mutation({
  args: {
    firstName: v.string(),
    middleName: v.optional(v.string()),
    lastName: v.string(),
    nickName: v.optional(v.string()),
    picture: v.optional(v.id("_storage")),
    mobileNumber: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    gender: v.union(v.literal("male"), v.literal("female"), v.literal("other")),
    gotra: v.optional(v.string()),
    native: v.optional(v.string()),
    maternal: v.optional(v.string()),
    birthPlace: v.optional(v.string()),
    bloodGroup: v.optional(
      v.union(
        v.literal("A+"),
        v.literal("A-"),
        v.literal("B+"),
        v.literal("B-"),
        v.literal("AB+"),
        v.literal("AB-"),
        v.literal("O+"),
        v.literal("O-"),
      ),
    ),
    relationship: v.optional(
      v.union(
        v.literal("single"),
        v.literal("married"),
        v.literal("divorced"),
        v.literal("widowed"),
        v.literal("rather not say"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await getCurrentUser(ctx);
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const existingProfile = await ctx.db
      .query("profile")
      .withIndex("by_userId", (q) => q.eq("userId", identity.user._id))
      .first();

    if (existingProfile) {
      throw new Error("Profile already exists");
    }

    const profileId = await ctx.db.insert("profile", {
      ...args,
      email: identity?.user?.email,
      userId: identity.user._id,
      status: "active",
    });

    return profileId;
  },
});

export const updateMyProfile = mutation({
  args: {
    profileId: v.id("profile"),
    payload: v.object({
      firstName: v.string(),
      middleName: v.optional(v.string()),
      lastName: v.string(),
      nickName: v.optional(v.string()),
      picture: v.optional(v.id("_storage")),
      mobileNumber: v.optional(v.string()),
      dateOfBirth: v.optional(v.string()),
      gender: v.union(
        v.literal("male"),
        v.literal("female"),
        v.literal("other"),
      ),
      gotra: v.optional(v.string()),
      native: v.optional(v.string()),
      maternal: v.optional(v.string()),
      birthPlace: v.optional(v.string()),
      bloodGroup: v.optional(
        v.union(
          v.literal("A+"),
          v.literal("A-"),
          v.literal("B+"),
          v.literal("B-"),
          v.literal("AB+"),
          v.literal("AB-"),
          v.literal("O+"),
          v.literal("O-"),
        ),
      ),
      relationship: v.optional(
        v.union(
          v.literal("single"),
          v.literal("married"),
          v.literal("divorced"),
          v.literal("widowed"),
          v.literal("rather not say"),
        ),
      ),
    }),
  },
  handler: async (ctx, args) => {
    const identity = await getCurrentUser(ctx);
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const checkMyProfile = await ctx.db
      .query("profile")
      .filter((q) =>
        q.and(
          q.eq(q.field("_id"), args.profileId),
          q.eq(q.field("userId"), identity.user._id),
        ),
      )
      .first();

    if (!checkMyProfile) {
      throw new Error("No profile found");
    }

    await ctx.db.patch(args.profileId, {
      ...args.payload,
    });

    return;
  },
});

export const listMembers = query({
  args: {},
  handler: async (ctx) => {
    const identity = await getCurrentUser(ctx);
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const profiles = await ctx.db
      .query("profile")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const profileWithPictures = await Promise.all(
      profiles.map(async (profile) => {
        let pictureUrl: string | null = null;
        if (profile.picture) {
          pictureUrl = await ctx.storage.getUrl(profile.picture);
        }
        return { ...profile, picture: pictureUrl };
      }),
    );

    return profileWithPictures;
  },
});

export const addMemberProfile = mutation({
  args: {
    firstName: v.string(),
    middleName: v.optional(v.string()),
    lastName: v.string(),
    nickName: v.optional(v.string()),
    picture: v.optional(v.id("_storage")),
    email: v.optional(v.string()),
    mobileNumber: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    dateOfDeath: v.optional(v.string()),
    gender: v.union(v.literal("male"), v.literal("female"), v.literal("other")),
    gotra: v.optional(v.string()),
    native: v.optional(v.string()),
    maternal: v.optional(v.string()),
    birthPlace: v.optional(v.string()),
    bloodGroup: v.optional(
      v.union(
        v.literal("A+"),
        v.literal("A-"),
        v.literal("B+"),
        v.literal("B-"),
        v.literal("AB+"),
        v.literal("AB-"),
        v.literal("O+"),
        v.literal("O-"),
      ),
    ),
    relationship: v.optional(
      v.union(
        v.literal("single"),
        v.literal("married"),
        v.literal("divorced"),
        v.literal("widowed"),
        v.literal("rather not say"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await getCurrentUser(ctx);
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const profileId = await ctx.db.insert("profile", {
      ...args,
      status: "draft",
      comment: `Record added by ${identity.user?.email ?? identity?.metadata?.email}`,
      userId: null,
    });

    return profileId;
  },
});

export const listProfileOptions = query({
  args: {},
  handler: async (ctx) => {
    const identity = await getCurrentUser(ctx);
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const profiles = await ctx.db
      .query("profile")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    return profiles.map((p) => ({
      _id: p._id,
      name: [p.firstName, p?.middleName, p?.lastName].filter(Boolean).join(" "),
      email: p?.email,
      picture: p?.picture,
      mobileNumber: p?.mobileNumber,
    }));
  },
});

export const getProfileDetail = query({
  args: {
    id: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await getCurrentUser(ctx);
    if (!identity) {
      throw new Error("Unauthorized");
    }
    try {
      const profile = await ctx.db.get(args.id as Id<"profile">);

      if (!profile) {
        return null;
      }

      let pictureUrl: string | null = null;
      if (profile.picture) {
        pictureUrl = await ctx.storage.getUrl(profile.picture);
      }

      const address = await ctx.db
        .query("address")
        .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
        .collect();
      const myRelations = await ctx.db
        .query("relations")
        .withIndex("by_fromProfileId", (q) =>
          q.eq("fromProfileId", profile._id),
        )
        .collect();
      const mentionedRelations = await ctx.db
        .query("relations")
        .withIndex("by_toProfileId", (q) => q.eq("toProfileId", profile._id))
        .collect();

      const relations = [...myRelations, ...mentionedRelations];

      const relationProfiles = await Promise.all(
        relations.map(async (relation) => {
          const fromProfile = await ctx.db.get(relation.fromProfileId);
          const toProfile = await ctx.db.get(relation.toProfileId);
          return {
            fromProfile,
            toProfile,
            ...relation,
          };
        }),
      );

      return {
        profile: { ...profile, picture: pictureUrl },
        address,
        relations: relationProfiles,
      };
    } catch (error) {
      console.error(error);
    }

    return null;
  },
});

export const generateProfileUploadUrl = mutation({
  handler: async (ctx) => {
    const identity = await getCurrentUser(ctx);
    if (!identity) {
      throw new Error("Unauthorized");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

export const changeMyProfilePicture = mutation({
  args: { storageId: v.id("_storage") },
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

    await ctx.db.patch(profile._id, {
      picture: args.storageId,
    });
  },
});

export const familyTreeProfileList = query({
  args: {},
  handler: async (ctx) => {
    const identity = await getCurrentUser(ctx);
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const profiles = await ctx.db
      .query("profile")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const profileWithPictures = await Promise.all(
      profiles.map(async (profile) => {
        let pictureUrl: string | null = null;
        if (profile.picture) {
          pictureUrl = await ctx.storage.getUrl(profile.picture);
        }
        return { ...profile, picture: pictureUrl };
      }),
    );

    return profileWithPictures;
  },
});
