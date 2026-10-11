import assert from "node:assert/strict";
import test from "node:test";

const traceModule = await import("../src/_entities/market-discovery/model/market-discovery-trace.ts");

test("market discovery export follows eis-claw shape and redacts credentials", () => {
  const trace = {
    version: 1,
    id: "run-legacy",
    status: "completed",
    startedAt: "2026-10-11T12:00:00.000Z",
    endedAt: "2026-10-11T12:00:02.000Z",
    durationMs: 2000,
    events: [{ id: "event-1", name: "Tìm nguồn", stage: "sources", status: "completed", startedAt: "2026-10-11T12:00:00.000Z", endedAt: "2026-10-11T12:00:00.100Z", durationMs: 100, detail: { count: 1 } }],
    calls: [
      { type: "tool_call", name: "tavily.search", toolName: "tavily.search", status: "completed", durationMs: 12, request: { query: "safe" } },
      { type: "llm_call", name: "provider.responses", status: "completed", durationMs: 24, provider: "oauth", model: "gpt-6-luna", request: { api_key: "secret-value" } },
    ],
    prompt: { system: "safe", user: "api_key=secret-value" },
    output: { opportunities: [] },
  };
  const payload = traceModule.buildMarketDiscoveryTracePayload(trace, [{ id: "source-1", title: "Source", url: "https://example.com", domain: "example.com", snippet: "Evidence", publishedAt: null }], [], "2026-10-11T12:00:03.000Z");

  assert.deepEqual(Object.keys(payload), ["exported_at", "trace", "spans"]);
  assert.equal(payload.exported_at, "2026-10-11T12:00:03.000Z");
  assert.equal(payload.trace.version, 2);
  assert.equal(payload.trace.span_count, 4);
  assert.equal(payload.trace.llm_call_count, 1);
  assert.equal(payload.trace.tool_call_count, 1);
  assert.equal(payload.spans.some((span) => span.span_type === "event"), true);
  assert.equal(payload.spans.some((span) => span.span_type === "llm_call"), true);
  assert.equal(payload.spans.some((span) => span.span_type === "tool_call"), true);
  assert.match(JSON.stringify(payload), /\[REDACTED\]/);
  assert.doesNotMatch(JSON.stringify(payload), /secret-value/);
});

test("v2 traces are normalized without inventing additional LLM calls", () => {
  const normalized = traceModule.normalizeMarketDiscoveryTrace({
    version: 2,
    id: "run-v2",
    run_id: "run-v2",
    status: "completed",
    start_time: "2026-10-11T12:00:00.000Z",
    end_time: "2026-10-11T12:00:02.000Z",
    duration_ms: 2000,
    input_preview: "input",
    output_preview: "output",
    metadata: {},
    spans: [
      { id: "agent", trace_id: "run-v2", span_type: "agent", name: "market-discovery", start_time: "2026-10-11T12:00:00.000Z", end_time: "2026-10-11T12:00:02.000Z", duration_ms: 2000, status: "completed", created_at: "2026-10-11T12:00:00.000Z" },
      { id: "llm", trace_id: "run-v2", parent_span_id: "agent", span_type: "llm_call", name: "provider.responses", start_time: "2026-10-11T12:00:01.000Z", end_time: "2026-10-11T12:00:02.000Z", duration_ms: 1000, status: "completed", created_at: "2026-10-11T12:00:01.000Z" },
    ],
  }, "run-v2");
  assert.equal(normalized.trace.llm_call_count, 1);
  assert.equal(normalized.trace.tool_call_count, 0);
  assert.equal(normalized.spans.length, 2);
});

test("redaction covers authorization headers", () => {
  assert.equal(traceModule.redactTraceText("Authorization: Bearer abc123"), "Authorization: [REDACTED]");
});
