import { NextResponse } from "next/server";

import {
  CompetitorResearchError,
  competitorResearchService,
} from "@/_entities/idea-competitor/index.server";
import { getCurrentAppUser } from "@/_features/auth/index.server";

export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function hasRequestBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return false;
      if (value?.byteLength) {
        await reader.cancel().catch(() => undefined);
        return true;
      }
    }
  } catch {
    return true;
  } finally {
    reader.releaseLock();
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let user;
  try {
    user = await getCurrentAppUser();
  } catch {
    return json({ error: "auth_unavailable" }, 500);
  }
  if (!user) return json({ error: "unauthorized" }, 401);
  if (await hasRequestBody(request)) return json({ error: "invalid_request" }, 400);

  const { id } = await params;
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) {
    return json({ error: "idea_not_found" }, 404);
  }

  try {
    return json(await competitorResearchService.researchForOwner(user.id, id));
  } catch (error) {
    if (error instanceof CompetitorResearchError) return json({ error: error.code }, error.status);
    console.error("[idea-competitors] research route failed", { errorCode: "research_failed" });
    return json({ error: "research_failed" }, 500);
  }
}
