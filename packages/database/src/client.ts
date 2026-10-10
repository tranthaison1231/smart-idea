import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/user";

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
