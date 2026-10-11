import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { appUsers } from "./user";

export const openaiOAuthAccounts = pgTable(
  "openai_oauth_accounts",
  {
    ownerId: uuid("owner_id")
      .primaryKey()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    hostId: text("host_id").notNull(),
    subject: text("subject").notNull(),
    email: text("email"),
    accessTokenCiphertext: text("access_token_ciphertext"),
    refreshTokenCiphertext: text("refresh_token_ciphertext"),
    idTokenCiphertext: text("id_token_ciphertext"),
    scopes: text("scopes").array().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
);

export const openaiOAuthTransactions = pgTable(
  "openai_oauth_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    stateHash: text("state_hash").notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    expectedSubject: text("expected_subject"),
    hostId: text("host_id").notNull(),
    codeVerifierCiphertext: text("code_verifier_ciphertext").notNull(),
    nonce: text("nonce").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    returnOrigin: text("return_origin").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("openai_oauth_transactions_state_hash_unique").on(table.stateHash),
    index("openai_oauth_transactions_owner_id_idx").on(table.ownerId),
    index("openai_oauth_transactions_expires_at_idx").on(table.expiresAt),
  ],
);
