import { NextResponse } from "next/server";

import {
  CompetitorResearchError,
  competitorResearchService,
} from "@/_entities/idea-competitor/index.server";
import { getCurrentAppUser } from "@/_features/auth/index.server";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 128 * 1024;
const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function readDraft(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new Error("invalid_request");
  }
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_BODY_BYTES)) {
    throw new Error("invalid_request");
  }

  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_request");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error("invalid_request");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function PUT(
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

  const { id } = await params;
  if (!uuidPattern.test(id)) return json({ error: "idea_not_found" }, 404);

  let draft: unknown;
  try {
    draft = await readDraft(request);
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  const body = typeof draft === "object" && draft !== null && !Array.isArray(draft)
    ? draft as Record<string, unknown>
    : null;
  if (!body || Object.keys(body).length !== 2 || !("competitors" in body) || !("proof" in body)) {
    return json({ error: "invalid_request" }, 400);
  }

  try {
    const competitors = await competitorResearchService.saveForOwner(user.id, id, draft);
    return competitors ? json({ competitors }) : json({ error: "idea_not_found" }, 404);
  } catch (error) {
    if (error instanceof CompetitorResearchError) return json({ error: error.code }, error.status);
    console.error("[idea-competitors] save route failed", { errorCode: "save_failed" });
    return json({ error: "save_failed" }, 500);
  }
}
