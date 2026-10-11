import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { appUsers } from "./user";

export const aiProviders = pgTable(
  "ai_providers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    providerType: text("provider_type").notNull(),
    baseUrl: text("base_url").notNull(),
    apiKeyCiphertext: text("api_key_ciphertext"),
    models: text("models").array().notNull().default(sql`'{}'::text[]`),
    model: text("model").notNull(),
    isEnabled: boolean("is_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("ai_providers_owner_id_idx").on(table.ownerId),
    uniqueIndex("ai_providers_one_enabled_per_owner_idx")
      .on(table.ownerId)
      .where(sql`${table.isEnabled} = true`),
    uniqueIndex("ai_providers_one_oauth_per_owner_idx")
      .on(table.ownerId)
      .where(sql`${table.providerType} = 'oauth'`),
  ],
);
