import { httpRouter } from "convex/server";
import { Webhook } from "svix";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

type ClerkWebhookUser = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  image_url?: string | null;
  primary_email_address_id?: string | null;
  email_addresses?: Array<{
    id: string;
    email_address: string;
  }>;
};

type ClerkWebhookEvent = {
  type: "user.created" | "user.updated" | "user.deleted";
  data: ClerkWebhookUser;
};

const http = httpRouter();

function requireClerkWebhookSecret(): string {
  const secret =
    process.env.CLERK_WEBHOOK_SIGNING_SECRET ?? process.env.CLERK_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error("Missing Clerk webhook signing secret");
  }

  return secret;
}

function normalizeWebhookUser(user: ClerkWebhookUser) {
  return {
    id: user.id,
    first_name: user.first_name ?? null,
    last_name: user.last_name ?? null,
    username: user.username ?? null,
    image_url: user.image_url ?? null,
    primary_email_address_id: user.primary_email_address_id ?? null,
    email_addresses: user.email_addresses ?? [],
  };
}

http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const payload = await req.text();
    const eventId = req.headers.get("svix-id");
    const timestamp = req.headers.get("svix-timestamp");
    const signature = req.headers.get("svix-signature");

    if (!eventId || !timestamp || !signature) {
      return new Response("Missing Svix headers", { status: 400 });
    }

    let event: ClerkWebhookEvent;
    try {
      event = new Webhook(requireClerkWebhookSecret()).verify(payload, {
        "svix-id": eventId,
        "svix-timestamp": timestamp,
        "svix-signature": signature,
      }) as ClerkWebhookEvent;
    } catch {
      return new Response("Invalid webhook signature", { status: 400 });
    }

    if (
      event.type !== "user.created" &&
      event.type !== "user.updated" &&
      event.type !== "user.deleted"
    ) {
      return new Response("Ignored", { status: 200 });
    }

    await ctx.runMutation(internal.users.syncFromClerkWebhook, {
      eventId,
      eventType: event.type,
      user: normalizeWebhookUser(event.data),
    });

    return new Response("Received", { status: 200 });
  }),
});

export default http;
