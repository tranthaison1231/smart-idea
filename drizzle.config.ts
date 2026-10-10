import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for Drizzle commands");
}

export default defineConfig({
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./packages/database/src/schema/user.ts",
  dbCredentials: { url: process.env.DATABASE_URL },
  strict: true,
  verbose: true,
});
