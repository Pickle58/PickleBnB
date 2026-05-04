import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";

type ClerkEmailAddress = {
  id: string;
  email_address: string;
};

type ClerkUserPayload = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  image_url: string | null;
  primary_email_address_id: string | null;
  email_addresses: ClerkEmailAddress[];
};

type ProcessedWebhookEvent = {
  processedAt: number;
};

const clerkUserValidator = v.object({
  id: v.string(),
  first_name: v.union(v.string(), v.null()),
  last_name: v.union(v.string(), v.null()),
  username: v.union(v.string(), v.null()),
  image_url: v.union(v.string(), v.null()),
  primary_email_address_id: v.union(v.string(), v.null()),
  email_addresses: v.array(
    v.object({
      id: v.string(),
      email_address: v.string(),
    }),
  ),
});

export function getPrimaryEmail(
  user: Pick<
    ClerkUserPayload,
    "email_addresses" | "primary_email_address_id"
  >,
): string | null {
  const primaryEmail = user.email_addresses.find(
    (email) => email.id === user.primary_email_address_id,
  );

  return (
    primaryEmail?.email_address ?? user.email_addresses[0]?.email_address ?? null
  );
}

export function normalizeClerkUser(user: ClerkUserPayload): {
  clerkUserId: string;
  name: string | null;
  email: string | null;
  imageUrl: string | null;
} {
  const nameParts = [user.first_name, user.last_name].filter(
    (part): part is string => Boolean(part),
  );
  const displayName =
    nameParts.length > 0 ? nameParts.join(" ") : (user.username ?? null);

  return {
    clerkUserId: user.id,
    name: displayName,
    email: getPrimaryEmail(user),
    imageUrl: user.image_url,
  };
}

export function shouldProcessWebhookEvent(
  event: ProcessedWebhookEvent | null,
): boolean {
  return event === null;
}

async function getCurrentUserByIdentity(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }

  const byTokenIdentifier = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();

  if (byTokenIdentifier) {
    return byTokenIdentifier;
  }

  const byClerkUserId = await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", identity.subject))
    .unique();

  if (!byClerkUserId) {
    throw new Error("User profile not found");
  }

  await ctx.db.patch(byClerkUserId._id, {
    tokenIdentifier: identity.tokenIdentifier,
    updatedAt: Date.now(),
  });

  return {
    ...byClerkUserId,
    tokenIdentifier: identity.tokenIdentifier,
  };
}

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const byTokenIdentifier = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (byTokenIdentifier) {
      return byTokenIdentifier;
    }

    return await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", identity.subject))
      .unique();
  },
});

export const updateProfile = mutation({
  args: {
    name: v.union(v.string(), v.null()),
    bio: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserByIdentity(ctx);
    const updatedAt = Date.now();

    await ctx.db.patch(user._id, {
      name: args.name,
      bio: args.bio,
      updatedAt,
    });

    return await ctx.db.get(user._id);
  },
});

export const syncFromClerkWebhook = internalMutation({
  args: {
    eventId: v.string(),
    eventType: v.union(
      v.literal("user.created"),
      v.literal("user.updated"),
      v.literal("user.deleted"),
    ),
    user: clerkUserValidator,
  },
  handler: async (ctx, args) => {
    const existingEvent = await ctx.db
      .query("webhookEvents")
      .withIndex("by_provider_and_eventId", (q) =>
        q.eq("provider", "clerk").eq("eventId", args.eventId),
      )
      .unique();

    if (!shouldProcessWebhookEvent(existingEvent)) {
      return { processed: false };
    }

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.user.id))
      .unique();
    const now = Date.now();

    if (args.eventType === "user.deleted") {
      if (existingUser) {
        await ctx.db.patch(existingUser._id, {
          deletedAt: now,
          updatedAt: now,
        });
      }
    } else {
      const normalizedUser = normalizeClerkUser(args.user);
      const userPatch = {
        ...normalizedUser,
        deletedAt: null,
        updatedAt: now,
      };

      if (existingUser) {
        await ctx.db.patch(existingUser._id, userPatch);
      } else {
        await ctx.db.insert("users", {
          ...userPatch,
          bio: null,
          roles: ["guest"],
          stripeConnectedAccountId: null,
          stripeChargesEnabled: false,
          stripePayoutsEnabled: false,
          stripeDetailsSubmitted: false,
          stripeRequirementsDue: [],
          stripeLastSyncedAt: null,
        });
      }
    }

    await ctx.db.insert("webhookEvents", {
      provider: "clerk",
      eventId: args.eventId,
      eventType: args.eventType,
      processedAt: now,
    });

    return { processed: true };
  },
});
