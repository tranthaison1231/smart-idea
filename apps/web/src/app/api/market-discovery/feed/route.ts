import { NextResponse } from "next/server";

import { marketDiscoveryService } from "@/_entities/market-discovery/index.server";
import { getCurrentAppUser } from "@/_features/auth/index.server";

export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
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
    return json(await marketDiscoveryService.getFeed(user.id));
  } catch {
    return json({ error: "feed_load_failed" }, 500);
  }
}
