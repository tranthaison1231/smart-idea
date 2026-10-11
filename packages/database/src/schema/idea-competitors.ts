import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import type { MarketSourceRecord } from "./market-discovery";
import { ideas } from "./idea";

export const ideaCompetitors = pgTable(
  "idea_competitors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ideaId: uuid("idea_id")
      .notNull()
      .references(() => ideas.id, { onDelete: "cascade" }),
    companyName: text("company_name").notNull(),
    productName: text("product_name"),
    website: text("website"),
    overview: text("overview").notNull(),
    targetCustomer: text("target_customer"),
    keyFeatures: text("key_features").array().notNull().default(sql`'{}'::text[]`),
    pricing: text("pricing"),
    strengths: text("strengths").array().notNull().default(sql`'{}'::text[]`),
    weaknesses: text("weaknesses").array().notNull().default(sql`'{}'::text[]`),
    sources: jsonb("sources").$type<MarketSourceRecord[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idea_competitors_idea_id_idx").on(table.ideaId)],
);
