import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as ideaSchema from "./schema/idea";
import * as aiProviderSchema from "./schema/ai-providers";
import * as marketDiscoverySchema from "./schema/market-discovery";
import * as openaiOAuthSchema from "./schema/openai-oauth";
import * as userSchema from "./schema/user";

const schema = { ...userSchema, ...ideaSchema, ...aiProviderSchema, ...openaiOAuthSchema, ...marketDiscoverySchema };

function createDatabase(url: string) {
  const client = postgres(url, { max: 1, prepare: false });
  return drizzle(client, { schema });
}

let database: ReturnType<typeof createDatabase> | undefined;

export function getDb() {
  if (database) return database;

  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not configured");

  database = createDatabase(url);
  return database;
}

export type DatabaseTransaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
