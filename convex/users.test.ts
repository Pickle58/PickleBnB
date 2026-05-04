import { describe, expect, test } from "vitest";
import {
  getPrimaryEmail,
  normalizeClerkUser,
  shouldProcessWebhookEvent,
} from "./users";

describe("Clerk user sync helpers", () => {
  test("selects the primary email address from Clerk email addresses", () => {
    expect(
      getPrimaryEmail({
        primary_email_address_id: "email_secondary",
        email_addresses: [
          { id: "email_primary", email_address: "first@example.com" },
          { id: "email_secondary", email_address: "second@example.com" },
        ],
      }),
    ).toBe("second@example.com");
  });

  test("normalizes Clerk user data into Convex profile fields", () => {
    expect(
      normalizeClerkUser({
        id: "user_123",
        first_name: "Ada",
        last_name: "Lovelace",
        username: null,
        image_url: "https://img.example.com/ada.png",
        primary_email_address_id: "email_123",
        email_addresses: [
          { id: "email_123", email_address: "ada@example.com" },
        ],
      }),
    ).toEqual({
      clerkUserId: "user_123",
      name: "Ada Lovelace",
      email: "ada@example.com",
      imageUrl: "https://img.example.com/ada.png",
    });
  });

  test("skips webhook events that were already processed", () => {
    expect(shouldProcessWebhookEvent(null)).toBe(true);
    expect(shouldProcessWebhookEvent({ processedAt: 123 })).toBe(false);
  });
});
