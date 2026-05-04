import { AuthConfig } from "convex/server";

if (!process.env.CLERK_FRONTEND_API_URL) {
  throw new Error("CLERK_FRONTEND_API_URL is not set");
}

export default {
  providers: [
    {
      domain: process.env.CLERK_FRONTEND_API_URL!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
