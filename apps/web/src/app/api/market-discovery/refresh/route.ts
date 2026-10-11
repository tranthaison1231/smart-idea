import { NextResponse } from "next/server";

import {
  MarketDiscoveryError,
  marketDiscoveryService,
  type MarketDiscoveryProgress,
} from "@/_entities/market-discovery/index.server";
import { getCurrentAppUser } from "@/_features/auth/index.server";

export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function streamRefresh(userId: string, mode: "daily" | "manual") {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const write = (event: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };
      const progress = (value: MarketDiscoveryProgress) => write({ type: "progress", ...value });

      try {
        const result = await marketDiscoveryService.refresh(userId, mode, progress);
        write({ type: "complete", ...result });
      } catch (error) {
        write({
          type: "error",
          error: error instanceof MarketDiscoveryError ? error.code : "discovery_failed",
        });
      } finally {
        if (!closed) controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
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

  return streamRefresh(user.id, value.mode);
}
