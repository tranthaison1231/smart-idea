import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import {
  authAccounts,
  authSessions,
  authUsers,
  authVerifications,
  getDb,
} from "@smart-idea/database/server";
import { createAuthOptions, readAuthEnvironment } from "./auth-options";

function createAuth() {
  const database = drizzleAdapter(getDb(), {
    provider: "pg",
    schema: {
      auth_accounts: authAccounts,
      auth_sessions: authSessions,
      auth_users: authUsers,
      auth_verifications: authVerifications,
    },
  });

  return betterAuth(createAuthOptions(database, readAuthEnvironment()));
}

let authInstance: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  return (authInstance ??= createAuth());
}
