import { gzipSync } from "node:zlib";
import { NextResponse } from "next/server";

import {
  buildMarketDiscoveryTracePayload,
  marketDiscoveryService,
} from "@/_entities/market-discovery/index.server";
import { getCurrentAppUser } from "@/_features/auth/index.server";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await getCurrentAppUser();
  } catch {
    return json({ error: "auth_failed" }, 500);
  }
  if (!user) return json({ error: "unauthorized" }, 401);

  const { id } = await params;
  if (!uuidPattern.test(id)) return json({ error: "trace_not_found" }, 404);

  try {
    const result = await marketDiscoveryService.getTrace(user.id, id);
    if (!result) return json({ error: "trace_not_found" }, 404);
    const payload = buildMarketDiscoveryTracePayload(
      result.trace as unknown as Parameters<typeof buildMarketDiscoveryTracePayload>[0],
      result.sources,
      result.opportunities,
    );
    const compressed = gzipSync(Buffer.from(JSON.stringify(payload), "utf8"));
    return new Response(compressed, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="trace-${id.slice(0, 8)}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}.json.gz"`,
      },
    });
  } catch {
    return json({ error: "trace_export_failed" }, 500);
  }
}
