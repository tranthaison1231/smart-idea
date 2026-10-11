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
  assert.equal(payload.trace.span_count, 3);
  assert.equal(payload.trace.llm_call_count, 1);
  assert.equal(payload.trace.tool_call_count, 1);
  assert.equal(payload.trace.events.length, 1);
  assert.equal(payload.spans.some((span) => span.span_type === "event"), false);
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

test("agent events become accurate multi-turn LLM and tool spans", () => {
  const trace = {
    version: 2,
    id: "run-events",
    agent_id: "market-discovery",
    run_id: "run-events",
    session_key: "market-discovery",
    start_time: "2026-10-11T12:00:00.000Z",
    end_time: null,
    duration_ms: null,
    name: "market-discovery",
    channel: "web",
    input_preview: "",
    output_preview: "",
    total_input_tokens: null,
    total_output_tokens: null,
    total_cost: null,
    span_count: 1,
    llm_call_count: 0,
    tool_call_count: 0,
    status: "running",
    error: null,
    metadata: {},
    created_at: "2026-10-11T12:00:00.000Z",
    spans: [{
      id: "run-events-agent",
      trace_id: "run-events",
      parent_span_id: null,
      span_type: "agent",
      name: "market-discovery",
      start_time: "2026-10-11T12:00:00.000Z",
      end_time: null,
      duration_ms: null,
      status: "running",
      created_at: "2026-10-11T12:00:00.000Z",
    }],
    events: [],
  };
  const events = [
    { type: "agent_start", runId: "agent-run", input: "research prompt api_key=secret", startedAt: "2026-10-11T12:00:00.000Z" },
    { type: "llm_start", runId: "llm-1", parentRunId: "agent-run", startedAt: "2026-10-11T12:00:01.000Z" },
    { type: "llm_end", runId: "llm-1", parentRunId: "agent-run", output: { usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 } }, endedAt: "2026-10-11T12:00:02.000Z" },
    { type: "tool_start", runId: "tool-1", parentRunId: "llm-1", toolName: "tavily.search_market_sources", input: "{query: 'market'}", startedAt: "2026-10-11T12:00:03.000Z" },
    { type: "tool_end", runId: "tool-1", parentRunId: "llm-1", toolName: "tavily.search_market_sources", output: { resultCount: 4 }, endedAt: "2026-10-11T12:00:04.000Z" },
    { type: "llm_start", runId: "llm-2", parentRunId: "agent-run", startedAt: "2026-10-11T12:00:05.000Z" },
    { type: "llm_end", runId: "llm-2", parentRunId: "agent-run", output: { usage: { inputTokens: 120, outputTokens: 30, totalTokens: 150 } }, endedAt: "2026-10-11T12:00:06.000Z" },
    { type: "tool_start", runId: "tool-2", parentRunId: "llm-2", toolName: "tavily.search_market_sources", input: "query-2", startedAt: "2026-10-11T12:00:07.000Z" },
    { type: "tool_end", runId: "tool-2", parentRunId: "llm-2", toolName: "tavily.search_market_sources", output: { resultCount: 3 }, endedAt: "2026-10-11T12:00:08.000Z" },
    { type: "tool_start", runId: "tool-3", parentRunId: "llm-2", toolName: "tavily.extract_market_sources", input: "urls", startedAt: "2026-10-11T12:00:09.000Z" },
    { type: "tool_end", runId: "tool-3", parentRunId: "llm-2", toolName: "tavily.extract_market_sources", output: { resultCount: 1 }, endedAt: "2026-10-11T12:00:10.000Z" },
    { type: "progress", progress: 80, message: "internal progress" },
    { type: "agent_end", runId: "agent-run", output: { opportunities: [{ productName: "Opportunity" }] }, endedAt: "2026-10-11T12:00:11.000Z" },
  ];
  for (const event of events) traceModule.appendMarketDiscoveryAgentEvent(trace, event);

  assert.equal(trace.llm_call_count, 2);
  assert.equal(trace.tool_call_count, 3);
  assert.equal(trace.span_count, 6);
  assert.equal(trace.spans.find((span) => span.metadata?.run_id === "tool-1").parent_span_id, trace.spans.find((span) => span.metadata?.run_id === "llm-1").id);
  assert.equal(trace.spans.find((span) => span.metadata?.run_id === "tool-3").tool_name, "tavily.extract_market_sources");
  assert.equal(trace.total_input_tokens, 220);
  assert.equal(trace.total_output_tokens, 50);
  assert.match(JSON.stringify(trace), /\[REDACTED\]/);
  assert.doesNotMatch(JSON.stringify(trace), /secret/);
});

test("trace stores turn decisions and safe reasoning summaries on executable spans", () => {
  const trace = {
    version: 2,
    id: "run-summary",
    agent_id: "market-discovery",
    run_id: "run-summary",
    session_key: "market-discovery",
    start_time: "2026-10-11T12:00:00.000Z",
    end_time: null,
    duration_ms: null,
    name: "market-discovery",
    channel: "web",
    input_preview: "",
    output_preview: "",
    total_input_tokens: null,
    total_output_tokens: null,
    total_cost: null,
    span_count: 1,
    llm_call_count: 0,
    tool_call_count: 0,
    status: "running",
    error: null,
    metadata: {},
    created_at: "2026-10-11T12:00:00.000Z",
    spans: [{
      id: "run-summary-agent", trace_id: "run-summary", parent_span_id: null, span_type: "agent", name: "market-discovery",
      start_time: "2026-10-11T12:00:00.000Z", end_time: null, duration_ms: null, status: "running", created_at: "2026-10-11T12:00:00.000Z",
    }],
    events: [],
  };
  appendSummaryEvents(traceModule, trace);
  const span = trace.spans.find((item) => item.span_type === "llm_call");
  assert.equal(span.metadata.turn_index, 2);
  assert.deepEqual(span.metadata.requested_tools, ["tavily_search_market_sources"]);
  assert.equal(span.metadata.decision_summary, "Tìm thêm bằng chứng độc lập.");
  assert.equal(span.metadata.reasoning_summary, "Đang kiểm tra độ mới.");
  const payload = traceModule.buildMarketDiscoveryTracePayload(trace, [], [], "2026-10-11T12:00:03.000Z");
  assert.match(JSON.stringify(payload), /Tìm thêm bằng chứng độc lập|Đang kiểm tra độ mới/);
  assert.doesNotMatch(JSON.stringify(payload), /encrypted_content|hidden-secret/);
});

function appendSummaryEvents(traceModule, trace) {
  traceModule.appendMarketDiscoveryAgentEvent(trace, { type: "agent_start", runId: "agent-run", startedAt: "2026-10-11T12:00:00.000Z" });
  traceModule.appendMarketDiscoveryAgentEvent(trace, { type: "llm_start", runId: "llm-summary", parentRunId: "agent-run", turnIndex: 2, startedAt: "2026-10-11T12:00:01.000Z" });
  traceModule.appendMarketDiscoveryAgentEvent(trace, {
    type: "llm_end", runId: "llm-summary", parentRunId: "agent-run", turnIndex: 2,
    requestedTools: ["tavily_search_market_sources"], decisionSummary: "Tìm thêm bằng chứng độc lập.", reasoningSummary: "Đang kiểm tra độ mới.",
    metadata: { encrypted_content: "hidden-secret", reasoning: "hidden-secret" }, input: { encrypted_content: "hidden-secret" },
    output: { usage: { inputTokens: 12, outputTokens: 4 }, encrypted_content: "hidden-secret" }, endedAt: "2026-10-11T12:00:02.000Z",
  });
}

test("pipeline progress is stored as separate events instead of executable spans", () => {
  const trace = {
    version: 2,
    id: "run-progress",
    agent_id: "market-discovery",
    run_id: "run-progress",
    session_key: "market-discovery",
    start_time: "2026-10-11T12:00:00.000Z",
    end_time: null,
    duration_ms: null,
    name: "market-discovery",
    channel: "web",
    input_preview: "",
    output_preview: "",
    total_input_tokens: null,
    total_output_tokens: null,
    total_cost: null,
    span_count: 1,
    llm_call_count: 0,
    tool_call_count: 0,
    status: "running",
    error: null,
    metadata: {},
    created_at: "2026-10-11T12:00:00.000Z",
    spans: [],
    events: [],
  };
  traceModule.appendMarketDiscoveryProgress(trace, { stage: "sources", progress: 20, message: "Tìm nguồn" });
  traceModule.appendMarketDiscoveryProgress(trace, { stage: "sources", progress: 40, message: "Đã tìm nguồn" });
  traceModule.appendMarketDiscoveryProgress(trace, { stage: "synthesis", progress: 80, message: "Tổng hợp" });
  assert.equal(trace.events.length, 2);
  assert.equal(trace.events[0].status, "completed");
  assert.equal(trace.events[0].progress, 40);
  assert.equal(trace.events[1].status, "running");
  assert.equal(trace.spans.length, 0);
});
