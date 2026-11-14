import "server-only";
import { WorkOS } from "@workos-inc/node";
import { createWorkOSIdentityProvider } from "./workos-identity-provider.js";

let cachedClient;
let cachedApiKey;

export function getWorkOSIdentityProvider() {
  const apiKey = process.env.WORKOS_API_KEY?.trim();
  if (!apiKey) {
    throw Object.assign(
      new Error("The WorkOS server API key is not configured."),
      { code: "IDENTITY_PROVIDER_NOT_CONFIGURED" },
    );
  }

  if (!cachedClient || cachedApiKey !== apiKey) {
    cachedClient = new WorkOS(apiKey);
    cachedApiKey = apiKey;
  }

  return createWorkOSIdentityProvider({
    workos: cachedClient,
    webhookSecret: process.env.WORKOS_WEBHOOK_SECRET,
  });
}
