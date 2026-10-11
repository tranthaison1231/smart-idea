import { NextResponse } from "next/server";

import { marketDiscoveryService } from "@/_entities/market-discovery/index.server";
import { parseMarketDiscoveryPreferences } from "@/_entities/market-discovery";
import { getCurrentAppUser } from "@/_features/auth/index.server";

export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function readRequestJson(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 8192) throw new Error("invalid_request");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_request");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8192) {
      await reader.cancel();
      throw new Error("invalid_request");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function GET() {
  let user;
  try {
    user = await getCurrentAppUser();
  } catch {
    return json({ error: "auth_failed" }, 500);
  }
  if (!user) return json({ error: "unauthorized" }, 401);

  try {
    return json({ preferences: await marketDiscoveryService.getPreferences(user.id) });
  } catch {
    return json({ error: "preferences_load_failed" }, 500);
  }
}

export async function PUT(request: Request) {
  let user;
  try {
    user = await getCurrentAppUser();
  } catch {
    return json({ error: "auth_failed" }, 500);
  }
  if (!user) return json({ error: "unauthorized" }, 401);

  let body: unknown;
  try {
    body = await readRequestJson(request);
  } catch {
    return json({ error: "invalid_preferences" }, 400);
  }
  const preferences = parseMarketDiscoveryPreferences(body);
  if (!preferences) return json({ error: "invalid_preferences" }, 400);

  try {
    return json({ preferences: await marketDiscoveryService.savePreferences(user.id, preferences) });
  } catch {
    return json({ error: "preferences_save_failed" }, 500);
  }
}
