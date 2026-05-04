import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.optional(v.string()),
    clerkUserId: v.string(),
    name: v.union(v.string(), v.null()),
    email: v.union(v.string(), v.null()),
    imageUrl: v.union(v.string(), v.null()),
    bio: v.union(v.string(), v.null()),
    roles: v.array(v.union(v.literal("guest"), v.literal("host"))),
    stripeConnectedAccountId: v.union(v.string(), v.null()),
    stripeChargesEnabled: v.boolean(),
    stripePayoutsEnabled: v.boolean(),
    stripeDetailsSubmitted: v.boolean(),
    stripeRequirementsDue: v.array(v.string()),
    stripeLastSyncedAt: v.union(v.number(), v.null()),
    deletedAt: v.union(v.number(), v.null()),
    updatedAt: v.number(),
  })
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_clerkUserId", ["clerkUserId"])
    .index("by_stripeConnectedAccountId", ["stripeConnectedAccountId"]),
  webhookEvents: defineTable({
    provider: v.union(v.literal("clerk"), v.literal("stripe")),
    eventId: v.string(),
    eventType: v.string(),
    processedAt: v.number(),
  }).index("by_provider_and_eventId", ["provider", "eventId"]),
  numbers: defineTable({
    value: v.number(),
  }),
});
