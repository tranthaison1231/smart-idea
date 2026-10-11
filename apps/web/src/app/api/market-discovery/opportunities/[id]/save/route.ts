import { NextResponse } from "next/server";

import { marketDiscoveryService } from "@/_entities/market-discovery/index.server";
import { getCurrentAppUser } from "@/_features/auth/index.server";

export const runtime = "nodejs";
const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await getCurrentAppUser();
  } catch {
    return json({ error: "auth_failed" }, 500);
  }
  if (!user) return json({ error: "unauthorized" }, 401);

  const { id } = await params;
  if (!uuidPattern.test(id)) return json({ error: "opportunity_not_found" }, 404);
  try {
    const ideaId = await marketDiscoveryService.saveOpportunityAsIdea(user.id, id);
    return ideaId ? json({ ideaId }) : json({ error: "opportunity_not_found" }, 404);
  } catch {
    return json({ error: "opportunity_save_failed" }, 500);
  }
}
