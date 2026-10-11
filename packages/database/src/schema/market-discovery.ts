import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { ideas } from "./idea";
import { appUsers } from "./user";

export interface MarketSourceRecord {
  id: string;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  publishedAt: string | null;
  fetchedAt?: string;
}

export const marketDiscoveryPreferences = pgTable("market_discovery_preferences", {
  ownerId: uuid("owner_id")
    .primaryKey()
    .references(() => appUsers.id, { onDelete: "cascade" }),
  markets: text("markets").array().notNull().default(sql`ARRAY['Việt Nam']::text[]`),
  topics: text("topics").array().notNull().default(sql`'{}'::text[]`),
  revenueModels: text("revenue_models").array().notNull().default(sql`'{}'::text[]`),
  customerSegments: text("customer_segments").array().notNull().default(sql`'{}'::text[]`),
  hiddenTags: jsonb("hidden_tags").$type<{
    markets: string[];
    topics: string[];
    revenueModels: string[];
    customerSegments: string[];
  }>().notNull().default(sql`'{"markets":[],"topics":[],"revenueModels":[],"customerSegments":[]}'::jsonb`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const marketDiscoverySnapshots = pgTable(
  "market_discovery_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    marketDate: date("market_date", { mode: "string" }).notNull(),
    scope: text("scope").notNull(),
    ownerId: uuid("owner_id").references(() => appUsers.id, { onDelete: "cascade" }),
    queryVersion: text("query_version").notNull(),
    state: text("state").notNull(),
    sources: jsonb("sources").$type<MarketSourceRecord[]>().notNull().default(sql`'[]'::jsonb`),
    errorCode: text("error_code"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("market_discovery_snapshots_daily_date_version_idx")
      .on(table.marketDate, table.queryVersion)
      .where(sql`${table.scope} = 'daily'`),
    index("market_discovery_snapshots_owner_created_idx").on(table.ownerId, table.createdAt),
    index("market_discovery_snapshots_date_idx").on(table.marketDate),
  ],
);

export const marketDiscoveryRuns = pgTable(
  "market_discovery_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => marketDiscoverySnapshots.id, { onDelete: "cascade" }),
    providerType: text("provider_type").notNull(),
    providerModel: text("provider_model").notNull(),
    state: text("state").notNull(),
    stale: boolean("stale").notNull().default(false),
    errorCode: text("error_code"),
    trace: jsonb("trace").$type<Record<string, unknown> | null>(),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("market_discovery_runs_owner_snapshot_idx").on(table.ownerId, table.snapshotId),
    index("market_discovery_runs_owner_created_idx").on(table.ownerId, table.createdAt),
  ],
);

export const marketDiscoveryOpportunities = pgTable(
  "market_discovery_opportunities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => marketDiscoveryRuns.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    productName: text("product_name").notNull(),
    problem: text("problem").notNull(),
    targetCustomer: text("target_customer").notNull(),
    solution: text("solution").notNull(),
    whyNow: text("why_now").notNull(),
    revenueModels: text("revenue_models").array().notNull().default(sql`'{}'::text[]`),
    confidence: text("confidence").notNull(),
    confidenceRationale: text("confidence_rationale").notNull(),
    sourceIds: text("source_ids").array().notNull().default(sql`'{}'::text[]`),
    savedIdeaId: uuid("saved_idea_id").references(() => ideas.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("market_discovery_opportunities_run_idx").on(table.runId),
    index("market_discovery_opportunities_owner_created_idx").on(table.ownerId, table.createdAt),
  ],
);
