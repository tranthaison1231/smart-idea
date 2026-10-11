import type { MarketSourceRecord } from "@smart-idea/database/server";

export type MarketDiscoveryTraceStatus = "running" | "completed" | "failed";
export type MarketDiscoveryTraceStepStatus = "running" | "completed" | "failed";
export type MarketDiscoveryTraceCallType = "agent" | "event" | "llm_call" | "tool_call";

/** JSON-safe span shaped like the eis-claw trace export. */
export interface MarketDiscoveryTraceSpan {
  id: string;
  trace_id: string;
  parent_span_id: string | null;
  agent_id?: string;
  span_type: MarketDiscoveryTraceCallType;
  name: string;
  start_time: string;
  end_time: string | null;
  duration_ms: number | null;
  status: MarketDiscoveryTraceStepStatus;
  error?: string | null;
  level?: string;
  model?: string;
  provider?: string;
  input_tokens?: number | null;
  output_tokens?: number | null;
  total_cost?: number | null;
  finish_reason?: string | null;
  model_params?: Record<string, unknown>;
  tool_name?: string;
  tool_call_id?: string;
  input_preview?: string;
  output_preview?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

/** Root fields intentionally mirror eis-claw's exported `trace` object. */
export interface MarketDiscoveryTrace {
  version: 2;
  id: string;
  agent_id: string;
  user_id?: string;
  session_key: string;
  run_id: string;
  start_time: string;
  end_time: string | null;
  duration_ms: number | null;
  name: string;
  channel: string;
  input_preview: string;
  output_preview: string;
  total_input_tokens: number | null;
  total_output_tokens: number | null;
  total_cost: number | null;
  span_count: number;
  llm_call_count: number;
  tool_call_count: number;
  status: MarketDiscoveryTraceStatus;
  error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  /** JSONB stores spans beside the root; export/API split them like eis-claw. */
  spans: MarketDiscoveryTraceSpan[];
}

export interface NormalizedMarketDiscoveryTrace {
  trace: MarketDiscoveryTrace;
  spans: MarketDiscoveryTraceSpan[];
}

const PREVIEW_LIMIT = 20_000;

export function preview(value: unknown, limit = PREVIEW_LIMIT) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return "";
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}

export function redactTraceText(value: string) {
  return value
    .replace(/((?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*)(["']?)[^\s,"'}]+/gi, "$1[REDACTED]")
    .replace(/(authorization\s*:\s*)(?:bearer\s+)?[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/(bearer\s+)[^\s,;]+/gi, "$1[REDACTED]");
}

function redactTraceValue(value: unknown): unknown {
  if (typeof value === "string") return redactTraceText(value);
  if (Array.isArray(value)) return value.map(redactTraceValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      /api[_-]?key|access[_-]?token|client[_-]?secret|password|authorization/i.test(key) ? "[REDACTED]" : redactTraceValue(item),
    ]));
  }
  return value;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback: number | null = null) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function statusValue(value: unknown): MarketDiscoveryTraceStepStatus {
  return value === "failed" || value === "running" ? value : "completed";
}

function spanFrom(value: unknown, index: number, traceId: string): MarketDiscoveryTraceSpan | null {
  const item = record(value);
  if (!item) return null;
  const spanType = item.span_type === "agent" || item.span_type === "event" || item.span_type === "llm_call" || item.span_type === "tool_call"
    ? item.span_type
    : null;
  if (!spanType) return null;
  const start = stringValue(item.start_time, new Date().toISOString());
  const span: MarketDiscoveryTraceSpan = {
    id: stringValue(item.id, `${traceId}-span-${index + 1}`),
    trace_id: stringValue(item.trace_id, traceId),
    parent_span_id: typeof item.parent_span_id === "string" ? item.parent_span_id : null,
    span_type: spanType,
    name: stringValue(item.name, spanType),
    start_time: start,
    end_time: typeof item.end_time === "string" ? item.end_time : null,
    duration_ms: numberValue(item.duration_ms),
    status: statusValue(item.status),
    created_at: stringValue(item.created_at, start),
  };
  for (const key of ["agent_id", "model", "provider", "finish_reason", "tool_name", "tool_call_id", "input_preview", "output_preview"] as const) {
    if (typeof item[key] === "string") span[key] = item[key] as never;
  }
  for (const key of ["input_tokens", "output_tokens", "total_cost"] as const) {
    if (item[key] !== undefined) span[key] = numberValue(item[key]);
  }
  if (item.error !== undefined) span.error = typeof item.error === "string" ? item.error : null;
  if (typeof item.level === "string") span.level = item.level;
  if (record(item.model_params)) span.model_params = item.model_params as Record<string, unknown>;
  if (record(item.metadata)) span.metadata = item.metadata as Record<string, unknown>;
  return span;
}

function makeTrace(input: {
  id: string;
  runId: string;
  start: string;
  end: string | null;
  duration: number | null;
  status: MarketDiscoveryTraceStatus;
  input: string;
  output: string;
  provider?: Record<string, unknown> | null;
  error?: unknown;
  metadata?: Record<string, unknown>;
  spans: MarketDiscoveryTraceSpan[];
}): MarketDiscoveryTrace {
  const llmCallCount = input.spans.filter((span) => span.span_type === "llm_call").length;
  const toolCallCount = input.spans.filter((span) => span.span_type === "tool_call").length;
  const providerType = typeof input.provider?.type === "string" ? input.provider.type : undefined;
  const providerModel = typeof input.provider?.model === "string" ? input.provider.model : undefined;
  return {
    version: 2,
    id: input.id,
    agent_id: "market-discovery",
    session_key: "market-discovery",
    run_id: input.runId,
    start_time: input.start,
    end_time: input.end,
    duration_ms: input.duration,
    name: "market-discovery",
    channel: "web",
    input_preview: redactTraceText(preview(input.input)),
    output_preview: redactTraceText(preview(input.output)),
    total_input_tokens: null,
    total_output_tokens: null,
    total_cost: null,
    span_count: input.spans.length,
    llm_call_count: llmCallCount,
    tool_call_count: toolCallCount,
    status: input.status,
    error: typeof input.error === "string" ? input.error : null,
    metadata: {
      ...(input.metadata ?? {}),
      ...(input.provider ? { provider: input.provider } : {}),
      ...(providerType ? { provider_type: providerType } : {}),
      ...(providerModel ? { provider_model: providerModel } : {}),
    },
    created_at: input.start,
    spans: input.spans,
  };
}

function normalizeV1(value: Record<string, unknown>, runId: string, sources: MarketSourceRecord[], opportunities: unknown[]): NormalizedMarketDiscoveryTrace {
  const startedAt = stringValue(value.startedAt, new Date().toISOString());
  const endedAt = typeof value.endedAt === "string" ? value.endedAt : null;
  const traceId = stringValue(value.id, runId);
  const rootId = `${traceId}-agent`;
  const legacyPrompt = record(value.prompt);
  const legacyOutput = record(value.output);
  const rootInput = legacyPrompt ? JSON.stringify({ system: legacyPrompt.system, user: legacyPrompt.user }) : "";
  const rootOutput = legacyOutput ? preview(legacyOutput.opportunities) : preview(opportunities);
  const spans: MarketDiscoveryTraceSpan[] = [{
    id: rootId,
    trace_id: traceId,
    parent_span_id: null,
    agent_id: "market-discovery",
    span_type: "agent",
    name: "market-discovery",
    start_time: startedAt,
    end_time: endedAt,
    duration_ms: numberValue(value.durationMs),
    status: statusValue(value.status),
    input_preview: redactTraceText(rootInput),
    output_preview: redactTraceText(rootOutput),
    metadata: { sourceCount: sources.length, opportunityCount: opportunities.length },
    created_at: startedAt,
  }];
  const events = Array.isArray(value.events) ? value.events : [];
  for (const [index, eventValue] of events.entries()) {
    const event = record(eventValue);
    if (!event) continue;
    const stage = stringValue(event.stage, "discovery");
    const eventId = stringValue(event.id, `${traceId}-event-${index + 1}`);
    spans.push({
      id: eventId,
      trace_id: traceId,
      parent_span_id: rootId,
      agent_id: "market-discovery",
      span_type: "event",
      name: stringValue(event.name, stage),
      start_time: stringValue(event.startedAt, startedAt),
      end_time: typeof event.endedAt === "string" ? event.endedAt : null,
      duration_ms: numberValue(event.durationMs),
      status: statusValue(event.status),
      input_preview: stage,
      output_preview: event.detail ? preview(event.detail) : "",
      metadata: { stage },
      created_at: stringValue(event.startedAt, startedAt),
    });
  }
  const calls = Array.isArray(value.calls) ? value.calls : [];
  for (const [index, callValue] of calls.entries()) {
    const call = record(callValue);
    if (!call) continue;
    const spanType = call.type === "llm_call" || call.name === "provider.responses" ? "llm_call" : "tool_call";
    const start = stringValue(call.startedAt, startedAt);
    spans.push({
      id: `${traceId}-call-${index + 1}`,
      trace_id: traceId,
      parent_span_id: rootId,
      agent_id: "market-discovery",
      span_type: spanType,
      name: stringValue(call.name, spanType),
      start_time: start,
      end_time: typeof call.endedAt === "string" ? call.endedAt : null,
      duration_ms: numberValue(call.durationMs),
      status: statusValue(call.status),
      provider: typeof call.provider === "string" ? call.provider : undefined,
      model: typeof call.model === "string" ? call.model : undefined,
      tool_name: typeof call.toolName === "string" ? call.toolName : undefined,
      input_preview: call.request ? redactTraceText(preview(redactTraceValue(call.request))) : "",
      output_preview: call.response ? redactTraceText(preview(redactTraceValue(call.response))) : "",
      error: typeof call.errorCode === "string" ? call.errorCode : null,
      created_at: start,
    });
  }
  return { trace: makeTrace({
    id: traceId,
    runId,
    start: startedAt,
    end: endedAt,
    duration: numberValue(value.durationMs),
    status: statusValue(value.status) === "running" ? "running" : statusValue(value.status),
    input: rootInput,
    output: rootOutput,
    provider: record(value.provider),
    error: record(value.error)?.code,
    metadata: { sourceCount: sources.length, opportunityCount: opportunities.length },
    spans,
  }), spans };
}

export function normalizeMarketDiscoveryTrace(
  value: unknown,
  runId: string,
  sources: MarketSourceRecord[] = [],
  opportunities: unknown[] = [],
): NormalizedMarketDiscoveryTrace {
  const root = record(value);
  if (!root) {
    const trace = makeTrace({ id: runId, runId, start: new Date().toISOString(), end: null, duration: null, status: "failed", input: "", output: "", spans: [] });
    return { trace, spans: [] };
  }
  if (root.version !== 2) return normalizeV1(root, runId, sources, opportunities);
  const traceId = stringValue(root.id, runId);
  const rawSpans = Array.isArray(root.spans) ? root.spans : [];
  const spans = rawSpans.map((span, index) => spanFrom(span, index, traceId)).filter((span): span is MarketDiscoveryTraceSpan => Boolean(span));
  const metadata = record(root.metadata) ?? {};
  const provider = record(metadata.provider);
  const trace = makeTrace({
    id: traceId,
    runId: stringValue(root.run_id, runId),
    start: stringValue(root.start_time, new Date().toISOString()),
    end: typeof root.end_time === "string" ? root.end_time : null,
    duration: numberValue(root.duration_ms),
    status: root.status === "failed" ? "failed" : root.status === "running" ? "running" : "completed",
    input: stringValue(root.input_preview),
    output: stringValue(root.output_preview),
    provider,
    error: root.error,
    metadata,
    spans,
  });
  return { trace, spans };
}

export function buildMarketDiscoveryTracePayload(
  value: unknown,
  sources: MarketSourceRecord[],
  opportunities: unknown[],
  exportedAt = new Date().toISOString(),
) {
  const root = record(value);
  const normalized = normalizeMarketDiscoveryTrace(value, stringValue(root?.run_id, stringValue(root?.id, "market-discovery")), sources, opportunities);
  const { spans, ...trace } = normalized.trace;
  return {
    exported_at: exportedAt,
    trace: redactTraceValue({
      ...trace,
      metadata: {
        ...trace.metadata,
        sources: redactTraceValue(sources),
        opportunities: redactTraceValue(opportunities),
      },
    }),
    spans: redactTraceValue(spans),
  };
}
