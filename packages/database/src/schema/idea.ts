import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { appUsers } from "./user";

export const ideas = pgTable(
  "ideas",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    industry: text("industry"),
    problem: text("problem"),
    targetCustomer: text("target_customer"),
    solution: text("solution"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("ideas_user_updated_at_idx").on(table.userId, table.updatedAt)],
);

export const ideaRevenueModels = pgTable(
  "idea_revenue_models",
  {
    ideaId: uuid("idea_id")
      .notNull()
      .references(() => ideas.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
  },
  (table) => [primaryKey({ columns: [table.ideaId, table.name] })],
);
