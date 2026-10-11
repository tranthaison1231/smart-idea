import { NextResponse } from "next/server";

import { MarketDiscoveryError, marketDiscoveryService } from "@/_entities/market-discovery/index.server";
import { getCurrentAppUser } from "@/_features/auth/index.server";

export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function readRequestJson(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 1024) throw new Error("invalid_request");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_request");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1024) {
      await reader.cancel();
      throw new Error("invalid_request");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function POST(request: Request) {
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
    return json({ error: "invalid_request" }, 400);
  }
  const value = typeof body === "object" && body !== null && !Array.isArray(body)
    ? body as Record<string, unknown>
    : null;
  if (
    !value || Object.keys(value).some((key) => key !== "mode") ||
    (value.mode !== "daily" && value.mode !== "manual")
  ) {
    return json({ error: "invalid_request" }, 400);
  }

  try {
    const result = await marketDiscoveryService.refresh(user.id, value.mode);
    return json(result, result.state === "processing" ? 202 : 200);
  } catch (error) {
    if (error instanceof MarketDiscoveryError) {
      return json({ error: error.code, ...(error.retryAt ? { retryAt: error.retryAt.toISOString() } : {}) }, error.status);
    }
    return json({ error: "discovery_failed" }, 500);
  }
}
