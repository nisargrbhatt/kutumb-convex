import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerified: v.optional(v.boolean()),
    role: v.union(
      v.literal("member"),
      v.literal("admin"),
      v.literal("superadmin"),
    ),
  }).index("email", ["email"]),
  profile: defineTable({
    firstName: v.string(),
    middleName: v.optional(v.string()),
    lastName: v.string(),
    nickName: v.optional(v.string()),
    picture: v.optional(v.string()),
    email: v.optional(v.string()),
    mobileNumber: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    gender: v.union(v.literal("male"), v.literal("female"), v.literal("other")),
    dateOfDeath: v.optional(v.string()),
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
    status: v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("draft"),
    ),
    comment: v.optional(v.string()),
    userId: v.union(v.id("users"), v.null()),
  })
    .index("by_userId", ["userId"])
    .index("by_status", ["status"]),
  address: defineTable({
    line1: v.string(),
    line2: v.optional(v.string()),
    country: v.string(),
    state: v.string(),
    city: v.string(),
    postalCode: v.string(),
    type: v.union(v.literal("home"), v.literal("work"), v.literal("other")),
    note: v.optional(v.string()),
    digipin: v.string(),
    profileId: v.id("profile"),
  }).index("by_profileId", ["profileId"]),
  relations: defineTable({
    fromProfileId: v.id("profile"),
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
  })
    .index("by_fromProfileId", ["fromProfileId"])
    .index("by_toProfileId", ["toProfileId"]),
});
