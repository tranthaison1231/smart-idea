import type { MarketSourceRecord } from "@smart-idea/database/server";

export type MarketDiscoveryTraceStatus = "running" | "completed" | "failed";
export type MarketDiscoveryTraceStepStatus = "running" | "completed" | "failed";
export type MarketDiscoveryTraceCallType = "agent" | "event" | "llm_call" | "tool_call";

export interface MarketDiscoveryTraceEvent {
  id: string;
  stage: string;
  name: string;
  progress: number;
  start_time: string;
  end_time: string | null;
  duration_ms: number | null;
  status: MarketDiscoveryTraceStepStatus;
  input_preview?: string;
  output_preview?: string;
  metadata?: Record<string, unknown>;
}

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
  /** Pipeline status events are kept separate from executable LLM/tool spans. */
  events: MarketDiscoveryTraceEvent[];
}

export interface NormalizedMarketDiscoveryTrace {
  trace: MarketDiscoveryTrace;
  spans: MarketDiscoveryTraceSpan[];
  events: MarketDiscoveryTraceEvent[];
}

export type MarketDiscoveryTraceAgentEvent = {
  type: "agent_start" | "agent_end" | "agent_error" | "llm_start" | "llm_end" | "llm_error" | "tool_start" | "tool_end" | "tool_error" | "progress";
  runId?: string;
  parentRunId?: string;
  parentRunIds?: string[];
  name?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
  startedAt?: string;
  endedAt?: string;
  turnIndex?: number;
  requestedTools?: string[];
  reasoningSummary?: string;
  decisionSummary?: string;
};

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
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !/^(reasoning|thoughts?|chain[_-]?of[_-]?thought)$/i.test(key) && !/encrypted[_-]?content|reasoning[_-]?content|chain[_-]?of[_-]?thought/i.test(key))
      .map(([key, item]) => [
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

function optionalString(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function numberValue(value: unknown, fallback: number | null = null) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function syncTraceCounts(trace: MarketDiscoveryTrace) {
  trace.span_count = trace.spans.filter((span) => span.span_type !== "event").length;
  trace.llm_call_count = trace.spans.filter((span) => span.span_type === "llm_call").length;
  trace.tool_call_count = trace.spans.filter((span) => span.span_type === "tool_call").length;
  const inputTokens = trace.spans.reduce((sum, span) => sum + (span.input_tokens ?? 0), 0);
  const outputTokens = trace.spans.reduce((sum, span) => sum + (span.output_tokens ?? 0), 0);
  trace.total_input_tokens = inputTokens || null;
  trace.total_output_tokens = outputTokens || null;
}

export function appendMarketDiscoveryProgress(
  trace: MarketDiscoveryTrace,
  progress: { stage: string; progress: number; message: string },
) {
  const now = new Date().toISOString();
  const previous = trace.events.at(-1);
  if (previous && previous.stage === progress.stage && previous.status === "running") {
    previous.name = progress.message;
    previous.progress = progress.progress;
    previous.end_time = now;
    previous.duration_ms = Math.max(0, Date.parse(now) - Date.parse(previous.start_time));
    return;
  }
  if (previous?.status === "running") {
    previous.status = "completed";
    previous.end_time = now;
    previous.duration_ms = Math.max(0, Date.parse(now) - Date.parse(previous.start_time));
  }
  trace.events.push({
    id: `${trace.id}-event-${trace.events.length + 1}`,
    stage: progress.stage,
    name: progress.message,
    progress: Math.max(0, Math.min(100, progress.progress)),
    start_time: now,
    end_time: null,
    duration_ms: null,
    status: "running",
  });
}

function spanForRun(trace: MarketDiscoveryTrace, runId: string | undefined) {
  if (!runId) return null;
  return trace.spans.find((span) => span.metadata?.run_id === runId) ?? null;
}

function eventOutputPreview(event: MarketDiscoveryTraceAgentEvent) {
  return event.output === undefined ? "" : redactTraceText(preview(redactTraceValue(event.output)));
}

function eventInputPreview(event: MarketDiscoveryTraceAgentEvent) {
  return event.input === undefined ? "" : redactTraceText(preview(redactTraceValue(event.input)));
}

function safeMetadata(value: unknown) {
  const metadata = redactTraceValue(value);
  return record(metadata) ?? {};
}

function eventSummaryMetadata(event: MarketDiscoveryTraceAgentEvent) {
  return {
    ...(typeof event.turnIndex === "number" ? { turn_index: event.turnIndex } : {}),
    ...(event.requestedTools?.length ? { requested_tools: event.requestedTools } : {}),
    ...(event.reasoningSummary ? { reasoning_summary: redactTraceText(event.reasoningSummary) } : {}),
    ...(event.decisionSummary ? { decision_summary: redactTraceText(event.decisionSummary) } : {}),
  };
}

function eventUsage(event: MarketDiscoveryTraceAgentEvent) {
  const output = record(event.output);
  const usage = record(output?.usage);
  if (!usage) return null;
  return {
    inputTokens: numberValue(usage.inputTokens),
    outputTokens: numberValue(usage.outputTokens),
  };
}

/**
 * Adds only real LangChain lifecycle events to the trace; progress labels are UI-only.
 */
export function appendMarketDiscoveryAgentEvent(trace: MarketDiscoveryTrace, event: MarketDiscoveryTraceAgentEvent) {
  if (event.type === "progress") return;
  const root = trace.spans.find((span) => span.span_type === "agent");
  if (!root) return;

  if (event.type === "agent_start" || event.type === "agent_end" || event.type === "agent_error") {
    if (event.runId) root.metadata = { ...(root.metadata ?? {}), ...safeMetadata(event.metadata), run_id: event.runId };
    if (event.input !== undefined) root.input_preview = eventInputPreview(event);
    if (event.output !== undefined) root.output_preview = eventOutputPreview(event);
    if (event.endedAt) {
      root.end_time = event.endedAt;
      root.duration_ms = Math.max(0, Date.parse(event.endedAt) - Date.parse(root.start_time));
    }
    if (event.type === "agent_error") {
      root.status = "failed";
      trace.error = event.error ?? "agent_failed";
    }
    syncTraceCounts(trace);
    return;
  }

  const spanType = event.type.startsWith("llm") ? "llm_call" : "tool_call";
  const isStart = event.type.endsWith("_start");
  const existing = spanForRun(trace, event.runId);
  if (isStart && existing) return;
  const span = existing ?? (event.runId ? {
    id: `${trace.id}-span-${trace.spans.length}`,
    trace_id: trace.id,
    parent_span_id: null,
    agent_id: "market-discovery",
    span_type: spanType,
    name: spanType === "tool_call" ? event.toolName ?? event.name ?? "tool" : event.name ?? "provider.responses",
    start_time: event.startedAt ?? new Date().toISOString(),
    end_time: null,
    duration_ms: null,
    status: "running" as const,
    provider: optionalString(event.metadata?.provider),
    model: optionalString(event.metadata?.model),
    input_preview: "",
    output_preview: "",
    metadata: {
      ...safeMetadata(event.metadata),
      ...eventSummaryMetadata(event),
      run_id: event.runId,
      ...(event.parentRunIds?.length ? { parent_run_ids: event.parentRunIds } : {}),
    },
    created_at: event.startedAt ?? new Date().toISOString(),
  } : null);
  if (!span) return;
  if (!existing) {
    const parentRuns = event.parentRunIds?.length ? [...event.parentRunIds].reverse() : [event.parentRunId];
    const parent = parentRuns.map((runId) => spanForRun(trace, runId)).find(Boolean);
    span.parent_span_id = parent?.id ?? root.id;
    trace.spans.push(span);
  }
  if (event.input !== undefined) span.input_preview = eventInputPreview(event);
  span.metadata = { ...(span.metadata ?? {}), ...eventSummaryMetadata(event) };
  if (event.toolName) {
    span.tool_name = event.toolName;
    span.name = event.toolName;
  }
  if (!isStart) {
    span.end_time = event.endedAt ?? new Date().toISOString();
    span.duration_ms = Math.max(0, Date.parse(span.end_time) - Date.parse(span.start_time));
    span.status = event.type.endsWith("error") ? "failed" : "completed";
    span.error = event.error ?? null;
    span.output_preview = eventOutputPreview(event);
    const usage = eventUsage(event);
    if (usage) {
      span.input_tokens = usage.inputTokens;
      span.output_tokens = usage.outputTokens;
    }
  }
  syncTraceCounts(trace);
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
  events?: MarketDiscoveryTraceEvent[];
}): MarketDiscoveryTrace {
  const executableSpans = input.spans.filter((span) => span.span_type !== "event");
  const llmCallCount = executableSpans.filter((span) => span.span_type === "llm_call").length;
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
    span_count: executableSpans.length,
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
    events: input.events ?? [],
  };
}

function traceEventsFrom(value: unknown, traceId: string): MarketDiscoveryTraceEvent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    const event = record(item);
    if (!event) return [];
    const start = stringValue(event.start_time, new Date().toISOString());
    return [{
      id: stringValue(event.id, `${traceId}-event-${index + 1}`),
      stage: stringValue(event.stage, "discovery"),
      name: stringValue(event.name, "discovery"),
      progress: Math.max(0, Math.min(100, numberValue(event.progress, 0) ?? 0)),
      start_time: start,
      end_time: typeof event.end_time === "string" ? event.end_time : null,
      duration_ms: numberValue(event.duration_ms),
      status: statusValue(event.status),
      input_preview: typeof event.input_preview === "string" ? redactTraceText(event.input_preview) : undefined,
      output_preview: typeof event.output_preview === "string" ? redactTraceText(event.output_preview) : undefined,
      metadata: record(event.metadata) ?? undefined,
    }];
  });
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
  const traceEvents = traceEventsFrom(events, traceId);
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
    events: traceEvents,
  }), spans, events: traceEvents };
}

export function normalizeMarketDiscoveryTrace(
  value: unknown,
  runId: string,
  sources: MarketSourceRecord[] = [],
  opportunities: unknown[] = [],
): NormalizedMarketDiscoveryTrace {
  const root = record(value);
  if (!root) {
    const trace = makeTrace({ id: runId, runId, start: new Date().toISOString(), end: null, duration: null, status: "failed", input: "", output: "", spans: [], events: [] });
    return { trace, spans: [], events: [] };
  }
  if (root.version !== 2) return normalizeV1(root, runId, sources, opportunities);
  const traceId = stringValue(root.id, runId);
  const rawSpans = Array.isArray(root.spans) ? root.spans : [];
  const spans = rawSpans.map((span, index) => spanFrom(span, index, traceId)).filter((span): span is MarketDiscoveryTraceSpan => Boolean(span));
  const metadata = record(root.metadata) ?? {};
  const provider = record(metadata.provider);
  const events = traceEventsFrom(root.events, traceId);
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
    events,
  });
  return { trace, spans, events };
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
