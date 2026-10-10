import "server-only";

import type { BetterAuthOptions } from "better-auth";

export interface AuthEnvironment {
  secret: string;
  url: string;
  google: {
    clientId: string;
    clientSecret: string;
  };
}

const requiredVariables = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
] as const;

export function isGoogleAuthConfigured() {
  if (!requiredVariables.every((name) => Boolean(process.env[name]?.trim()))) {
    return false;
  }

  if ((process.env.BETTER_AUTH_SECRET?.trim().length ?? 0) < 32) return false;

  try {
    const url = new URL(process.env.BETTER_AUTH_URL!.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function requiredEnvironment(name: (typeof requiredVariables)[number]) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function readAuthEnvironment(): AuthEnvironment {
  const secret = requiredEnvironment("BETTER_AUTH_SECRET");
  if (secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters");
  }

  const clientId = requiredEnvironment("GOOGLE_CLIENT_ID");
  const clientSecret = requiredEnvironment("GOOGLE_CLIENT_SECRET");
  const url = new URL(requiredEnvironment("BETTER_AUTH_URL")).origin;

  return { secret, url, google: { clientId, clientSecret } };
}

export function createAuthOptions(
  database: NonNullable<BetterAuthOptions["database"]>,
  environment: AuthEnvironment,
) {
  return {
    appName: "Smart Idea",
    database,
    secret: environment.secret,
    baseURL: environment.url,
    trustedOrigins: [environment.url],
    socialProviders: {
      google: {
        clientId: environment.google.clientId,
        clientSecret: environment.google.clientSecret,
      },
    },
    session: {
      modelName: "auth_sessions",
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    user: { modelName: "auth_users" },
    account: { modelName: "auth_accounts" },
    verification: { modelName: "auth_verifications" },
    rateLimit: { enabled: true, window: 60, max: 10 },
  } satisfies BetterAuthOptions;
}
