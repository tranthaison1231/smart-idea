import { ChatOpenAI, type ChatOpenAIFields } from "@langchain/openai";
import { createAgent, tool, toolStrategy } from "langchain";
import { z } from "zod";

import type { AiProviderForInference } from "@/_entities/ai-provider/server/provider-repository";
import type { MarketSourceRecord } from "@smart-idea/database/server";
import {
  TavilyConfigurationError,
  TavilySearchError,
  tavilyExtractSources,
  tavilySearchQuery,
  type TavilySearchQueryOptions,
} from "./tavily-search.ts";
import type { MarketDiscoveryPreferences } from "../model/market-discovery-preferences";
import { preview, redactTraceText } from "../model/market-discovery-trace.ts";

const MARKET_DISCOVERY_MODEL_TIMEOUT_MS = 60_000;
const MARKET_DISCOVERY_AGENT_DEADLINE_MS = 120_000;
const CODEX_RESPONSES_BASE_URL = "https://chatgpt.com/backend-api/codex";
const MAX_SEARCH_CALLS = 6;
const MAX_EXTRACT_CALLS = 3;
const MAX_EXTRACT_URLS = 3;
const MAX_COLLECTED_SOURCES = 30;
const MAX_TOOL_PREVIEW = 2_000;

export const MarketDiscoveryOpportunityOutputSchema = z.object({
  opportunities: z.array(z.object({
    productName: z.string().trim().min(1).max(160),
    problem: z.string().trim().min(1).max(1_000),
    targetCustomer: z.string().trim().min(1).max(700),
    solution: z.string().trim().min(1).max(1_000),
    whyNow: z.string().trim().min(1).max(1_200),
    revenueModels: z.array(z.string().trim().min(1).max(100)).min(1).max(5),
    confidence: z.enum(["low", "medium", "high"]),
    confidenceRationale: z.string().trim().min(1).max(1_000),
    sourceIds: z.array(z.string().trim().min(1).max(160)).min(1).max(8),
  })).min(1).max(5),
});

export type MarketDiscoveryOpportunityOutput = z.infer<typeof MarketDiscoveryOpportunityOutputSchema>;

export type MarketDiscoveryAgentEvent = {
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
  progress?: number;
  message?: string;
  turnIndex?: number;
  requestedTools?: string[];
  reasoningSummary?: string;
  decisionSummary?: string;
};

export type MarketDiscoveryAgentInput = {
  provider: AiProviderForInference;
  preferences: MarketDiscoveryPreferences;
  marketDate: string;
  signal?: AbortSignal;
  onEvent?: (event: MarketDiscoveryAgentEvent) => void;
  onProgress?: (progress: { stage: "sources" | "synthesis"; progress: number; message: string }) => void;
};

export type MarketDiscoveryAgentResult = {
  opportunities: MarketDiscoveryOpportunityOutput["opportunities"];
  sources: MarketSourceRecord[];
  applicationPrompt: { system: string; user: string };
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
};

export type MarketDiscoveryModelConfig = ChatOpenAIFields & {
  apiKey: string;
  model: string;
  configuration: NonNullable<ChatOpenAIFields["configuration"]>;
};

export type MarketDiscoveryAgentTool = {
  name: string;
  invoke: (...args: never[]) => Promise<unknown>;
};

export type MarketDiscoveryAgentDependencies = {
  model?: unknown;
  searchTool?: (options: TavilySearchQueryOptions) => Promise<MarketSourceRecord[]>;
  extractTool?: (urls: readonly string[]) => Promise<MarketSourceRecord[]>;
  agentFactory?: (options: {
    model: unknown;
    tools: MarketDiscoveryAgentTool[];
    responseFormat: unknown;
    systemPrompt: string;
  }) => {
    streamEvents: (input: unknown, options?: Record<string, unknown>) => Promise<AsyncIterable<unknown>> | AsyncIterable<unknown>;
  };
  now?: () => Date;
};

export class MarketDiscoveryAgentError extends Error {
  readonly code: "invalid_ai_response" | "search_budget_exceeded" | "extract_budget_exceeded" | "agent_failed";

  constructor(code: "invalid_ai_response" | "search_budget_exceeded" | "extract_budget_exceeded" | "agent_failed") {
    super(code);
    this.code = code;
  }
}

export function marketDiscoveryModelConfig(provider: AiProviderForInference): MarketDiscoveryModelConfig {
  if (provider.credentialType === "oauth") {
    return {
      apiKey: provider.accessToken,
      model: provider.model,
      timeout: MARKET_DISCOVERY_MODEL_TIMEOUT_MS,
      maxRetries: 0,
      useResponsesApi: true,
      modelKwargs: { store: false },
      configuration: {
        baseURL: CODEX_RESPONSES_BASE_URL,
        defaultHeaders: { "OpenAI-Beta": "responses=v1" },
      },
    };
  }

  return {
    apiKey: provider.apiKey,
    model: provider.model,
    temperature: 0.2,
    timeout: MARKET_DISCOVERY_MODEL_TIMEOUT_MS,
    maxRetries: 0,
    useResponsesApi: false,
    configuration: { baseURL: provider.baseUrl },
  };
}

export function createMarketDiscoveryModel(provider: AiProviderForInference) {
  return new ChatOpenAI(marketDiscoveryModelConfig(provider));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function safePreview(value: unknown, limit = MAX_TOOL_PREVIEW) {
  return redactTraceText(preview(value, limit));
}

function textValue(value: unknown, limit = 1_200) {
  return typeof value === "string" && value.trim() ? safePreview(value.trim(), limit) : undefined;
}

function sourcePreview(source: MarketSourceRecord) {
  return {
    id: source.id,
    title: source.title,
    url: source.url,
    domain: source.domain,
    publishedAt: source.publishedAt,
    fetchedAt: source.fetchedAt,
    snippet: source.snippet.slice(0, 500),
  };
}

function toolCallsFrom(value: unknown) {
  const item = asRecord(value);
  const direct = Array.isArray(item?.tool_calls) ? item.tool_calls : [];
  const generatedMessages = Array.isArray(item?.generations)
    ? item.generations.flatMap((generation) => {
      const record = asRecord(generation);
      return record?.message === undefined ? [] : [record.message];
    })
    : [];
  const calls = [value, ...generatedMessages].flatMap((message) => {
    const record = asRecord(message);
    const candidates = record && Array.isArray(record.tool_calls) ? record.tool_calls : direct;
    return candidates.flatMap((call) => {
      const candidate = asRecord(call);
      return candidate && typeof candidate.name === "string"
        ? [{ name: candidate.name, id: typeof candidate.id === "string" ? candidate.id : undefined }]
        : [];
    });
  });
  return calls.filter((call, index) => calls.findIndex((candidate) => candidate.name === call.name && candidate.id === call.id) === index);
}

function reasoningSummaryFrom(value: unknown) {
  const item = asRecord(value);
  const responseMetadata = asRecord(item?.response_metadata);
  const additionalKwargs = asRecord(item?.additional_kwargs);
  for (const candidate of [item?.reasoning, responseMetadata?.reasoning, additionalKwargs?.reasoning]) {
    const reasoning = asRecord(candidate);
    if (!reasoning) continue;
    if (typeof reasoning.summary === "string") return textValue(reasoning.summary);
    if (Array.isArray(reasoning.summary)) {
      const summary = reasoning.summary.flatMap((entry) => {
        const record = asRecord(entry);
        return typeof record?.text === "string" ? [record.text] : [];
      }).join(" ");
      if (summary) return textValue(summary);
    }
  }
  return undefined;
}

function explicitDecisionSummaryFrom(value: unknown) {
  const item = asRecord(value);
  const responseMetadata = asRecord(item?.response_metadata);
  return textValue(item?.decision_summary ?? item?.decisionSummary ?? responseMetadata?.decision_summary ?? responseMetadata?.decisionSummary);
}

function systemPrompt(input: MarketDiscoveryAgentInput, currentDate: string) {
  const selected = {
    markets: input.preferences.markets,
    topics: input.preferences.topics,
    revenueModels: input.preferences.revenueModels,
    customerSegments: input.preferences.customerSegments,
  };
  return [
    "Bạn là agent nghiên cứu cơ hội sản phẩm số cho thị trường Việt Nam và các thị trường user chọn.",
    `Ngày hiện tại: ${currentDate}. Ngày feed: ${input.marketDate}.`,
    `Ưu tiên mềm của user: ${JSON.stringify(selected)}. Nhóm để trống nghĩa là khám phá rộng.`,
    "Hãy tự lập kế hoạch nhiều góc nghiên cứu. Sau mỗi kết quả, đánh giá bằng chứng còn thiếu rồi tự quyết định: tìm thêm một góc, đọc sâu một URL, hoặc kết thúc nếu đã đủ bằng chứng. Không cần theo số lượt cố định; ưu tiên topic news/general và timeRange week/month, chỉ mở rộng year khi tín hiệu mới quá ít. Gọi tavily_extract_market_sources khi cần đọc sâu tối đa ba URL.",
    "Kiểm tra publishedAt và fetchedAt của nguồn. Nguồn không có ngày vẫn dùng được làm bằng chứng nhưng không được gọi là mới nhất hay xu hướng hiện tại.",
    "Chỉ tạo cơ hội có sourceIds trỏ tới nguồn đã thu thập trong lượt chạy. Không bịa nguồn, số liệu, ngày hoặc đối thủ.",
    "Kết quả cuối phải là structured output đúng schema với tối đa năm cơ hội, mỗi cơ hội có vấn đề, khách hàng, giải pháp, vì sao bây giờ, doanh thu, độ tin cậy và sourceIds.",
    "Không ghi hoặc tiết lộ chain-of-thought nội bộ; chỉ trả kết quả có thể kiểm chứng và tóm tắt bằng chứng.",
  ].join("\n");
}

function eventType(rawEvent: string): MarketDiscoveryAgentEvent["type"] | null {
  switch (rawEvent) {
    case "on_chain_start": return "agent_start";
    case "on_chain_end": return "agent_end";
    case "on_chain_error": return "agent_error";
    case "on_chat_model_start": return "llm_start";
    case "on_chat_model_end": return "llm_end";
    case "on_chat_model_error": return "llm_error";
    case "on_tool_start": return "tool_start";
    case "on_tool_end": return "tool_end";
    case "on_tool_error": return "tool_error";
    default: return null;
  }
}

function eventPayload(type: MarketDiscoveryAgentEvent["type"], data: Record<string, unknown> | null) {
  if (!data) return undefined;
  if (type.startsWith("llm")) {
    const output = asRecord(data.output);
    const responseMetadata = asRecord(output?.response_metadata);
    const usage = asRecord(output?.usage_metadata) ?? asRecord(output?.usageMetadata) ?? asRecord(responseMetadata?.usage) ?? asRecord(responseMetadata?.token_usage);
    const calls = toolCallsFrom(output);
    const reasoningSummary = reasoningSummaryFrom(output);
    const decisionSummary = explicitDecisionSummaryFrom(output);
    return {
      ...(usage ? { usage: {
        inputTokens: numberValue(usage.input_tokens ?? usage.prompt_tokens),
        outputTokens: numberValue(usage.output_tokens ?? usage.completion_tokens),
        totalTokens: numberValue(usage.total_tokens),
      } } : {}),
      ...(calls.length ? { requestedTools: calls.map((call) => call.name), toolCalls: calls } : {}),
      ...(reasoningSummary ? { reasoningSummary } : {}),
      ...(decisionSummary ? { decisionSummary } : {}),
    };
  }
  if (type.startsWith("tool")) {
    if (data.input !== undefined) return safePreview(data.input);
    if (data.output !== undefined) return safePreview(data.output);
  }
  return undefined;
}

function normalizeEvent(raw: unknown, now: string): MarketDiscoveryAgentEvent | null {
  const value = asRecord(raw);
  if (!value || typeof value.event !== "string") return null;
  const type = eventType(value.event);
  if (!type) return null;
  const parentRunIds = Array.isArray(value.parent_ids)
    ? value.parent_ids.filter((id): id is string => typeof id === "string")
    : [];
  const data = asRecord(value.data);
  const error = asRecord(data?.error);
  const event: MarketDiscoveryAgentEvent = {
    type,
    runId: typeof value.run_id === "string" ? value.run_id : undefined,
    parentRunId: parentRunIds.at(-1),
    parentRunIds,
    name: typeof value.name === "string" ? value.name : undefined,
    toolName: type.startsWith("tool") && typeof value.name === "string" ? value.name : undefined,
    output: eventPayload(type, data),
    error: error ? safePreview(error, 500) : undefined,
    metadata: asRecord(value.metadata) ?? undefined,
    startedAt: now,
    endedAt: type.endsWith("end") || type.endsWith("error") ? now : undefined,
  };
  if (type === "tool_start") event.input = data?.input === undefined ? undefined : safePreview(data.input);
  if (type === "llm_start") event.input = data?.input === undefined ? undefined : safePreview(data.input);
  if (type === "agent_start" && parentRunIds.length > 0) return null;
  if (type === "agent_end" && parentRunIds.length > 0) return null;
  return event;
}

function structuredResponseFrom(data: unknown) {
  const record = asRecord(data);
  return record?.structuredResponse ?? record?.structured_response;
}

function addSources(target: Map<string, MarketSourceRecord>, found: MarketSourceRecord[]) {
  const selected: MarketSourceRecord[] = [];
  for (const source of found) {
    if (!target.has(source.id) && target.size >= MAX_COLLECTED_SOURCES) continue;
    target.set(source.id, source);
    selected.push(source);
  }
  return selected;
}

function validateOutput(value: unknown, sources: Map<string, MarketSourceRecord>) {
  const parsed = MarketDiscoveryOpportunityOutputSchema.safeParse(value);
  if (!parsed.success || parsed.data.opportunities.some((opportunity) => opportunity.sourceIds.some((id) => !sources.has(id)))) {
    throw new MarketDiscoveryAgentError("invalid_ai_response");
  }
  return parsed.data;
}

export async function runMarketDiscoveryAgent(
  input: MarketDiscoveryAgentInput,
  dependencies: MarketDiscoveryAgentDependencies = {},
): Promise<MarketDiscoveryAgentResult> {
  const now = dependencies.now ?? (() => new Date());
  const sources = new Map<string, MarketSourceRecord>();
  let searchCalls = 0;
  let extractCalls = 0;
  let extractedUrls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let structuredResponse: unknown;
  let llmTurn = 0;
  const turnByRunId = new Map<string, number>();
  const currentDate = now().toISOString().slice(0, 10);
  const system = systemPrompt(input, currentDate);
  const user = JSON.stringify({
    task: "Nghiên cứu các cơ hội sản phẩm số có bằng chứng mới, so sánh nhiều góc thị trường và chỉ trả cơ hội có nguồn kiểm chứng.",
    marketDate: input.marketDate,
    preferences: {
      markets: input.preferences.markets,
      topics: input.preferences.topics,
      revenueModels: input.preferences.revenueModels,
      customerSegments: input.preferences.customerSegments,
    },
  });
  const search = dependencies.searchTool ?? ((options: TavilySearchQueryOptions) => tavilySearchQuery(options));
  const extract = dependencies.extractTool ?? ((urls: readonly string[]) => tavilyExtractSources(urls));

  const searchTool = tool(async (options) => {
    if (searchCalls >= MAX_SEARCH_CALLS) throw new MarketDiscoveryAgentError("search_budget_exceeded");
    searchCalls += 1;
    const remaining = MAX_COLLECTED_SOURCES - sources.size;
    if (remaining <= 0) return [];
    const found = await search({
      ...(options as TavilySearchQueryOptions),
      maxResults: Math.min(options.maxResults ?? 6, remaining),
    });
    const selected = addSources(sources, found);
    input.onProgress?.({ stage: "sources", progress: Math.min(70, 15 + searchCalls * 8), message: `Đã tìm ${searchCalls}/${MAX_SEARCH_CALLS} lượt nguồn` });
    return selected.map(sourcePreview);
  }, {
    name: "tavily_search_market_sources",
    description: "Tìm nguồn thị trường công khai có ngày xuất bản, tập trung vào thị trường và xu hướng user chọn.",
    schema: z.object({
      query: z.string().trim().min(1).max(240),
      topic: z.enum(["general", "news", "finance"]).default("general"),
      timeRange: z.enum(["day", "week", "month", "year"]).default("month"),
      language: z.string().trim().min(2).max(20).default("vi"),
      country: z.string().trim().min(2).max(80).default("vietnam"),
      maxResults: z.number().int().min(1).max(20).default(6),
    }),
  });

  const extractTool = tool(async ({ urls }) => {
    if (extractCalls >= MAX_EXTRACT_CALLS) throw new MarketDiscoveryAgentError("extract_budget_exceeded");
    extractCalls += 1;
    const remaining = MAX_EXTRACT_URLS - extractedUrls;
    if (remaining <= 0) return [];
    const urlsToFetch = urls.slice(0, remaining);
    extractedUrls += urlsToFetch.length;
    const found = await extract(urlsToFetch);
    const selected = addSources(sources, found);
    input.onProgress?.({ stage: "sources", progress: Math.min(78, 63 + extractedUrls * 5), message: `Đã đọc sâu ${extractedUrls}/${MAX_EXTRACT_URLS} nguồn` });
    return selected.map(sourcePreview);
  }, {
    name: "tavily_extract_market_sources",
    description: "Đọc sâu tối đa ba URL HTTPS đã tìm thấy để lấy bằng chứng đầy đủ hơn.",
    schema: z.object({ urls: z.array(z.string().url().startsWith("https://")).min(1).max(3) }),
  });

  const model = dependencies.model ?? createMarketDiscoveryModel(input.provider);
  const responseFormat = toolStrategy(MarketDiscoveryOpportunityOutputSchema, { handleError: false });
  const signal = input.signal ?? AbortSignal.timeout(MARKET_DISCOVERY_AGENT_DEADLINE_MS);
  const agent = dependencies.agentFactory
    ? dependencies.agentFactory({ model, tools: [searchTool, extractTool], responseFormat, systemPrompt: system })
    : createAgent({ model: model as never, tools: [searchTool, extractTool], responseFormat, systemPrompt: system });

  try {
    const stream = await agent.streamEvents({ messages: [{ role: "user", content: user }] }, {
      version: "v2",
      signal,
      recursionLimit: 24,
    });
    for await (const rawEvent of stream) {
      if (signal.aborted) throw signal.reason ?? new Error("aborted");
      const value = asRecord(rawEvent);
      const normalized = normalizeEvent(rawEvent, now().toISOString());
      if (normalized) {
        if (normalized.type === "llm_start") {
          llmTurn += 1;
          if (normalized.runId) turnByRunId.set(normalized.runId, llmTurn);
          normalized.turnIndex = llmTurn;
        } else if (normalized.type.startsWith("llm")) {
          normalized.turnIndex = normalized.runId ? turnByRunId.get(normalized.runId) : undefined;
        } else if (normalized.type.startsWith("tool")) {
          normalized.turnIndex = normalized.parentRunIds?.map((runId) => turnByRunId.get(runId)).find((value): value is number => value !== undefined);
        }
        const payload = asRecord(normalized.output);
        const requestedTools = Array.isArray(payload?.requestedTools)
          ? payload.requestedTools.filter((name): name is string => typeof name === "string")
          : [];
        if (normalized.type.startsWith("llm")) {
          normalized.requestedTools = requestedTools;
          normalized.reasoningSummary = typeof payload?.reasoningSummary === "string" ? payload.reasoningSummary : undefined;
          normalized.decisionSummary = typeof payload?.decisionSummary === "string"
            ? payload.decisionSummary
            : requestedTools.length
              ? `Đang chọn bước tiếp theo bằng tool: ${requestedTools.join(", ")}`
              : normalized.type === "llm_start"
                ? "Đang đánh giá bằng chứng và chọn bước tiếp theo."
                : "Đang tổng hợp kết quả có nguồn dẫn chứng.";
        }
        input.onEvent?.(normalized);
        if (normalized.type.startsWith("llm")) input.onProgress?.({ stage: "synthesis", progress: 80, message: "AI đang đối chiếu bằng chứng và cấu trúc hóa cơ hội" });
      }
      if (value?.event === "on_chain_end") {
        const candidate = structuredResponseFrom(asRecord(value.data)?.output);
        if (candidate !== undefined) structuredResponse = candidate;
      }
      const usage = asRecord(asRecord(normalized?.output)?.usage);
      if (usage) {
        inputTokens += numberValue(usage.inputTokens) ?? 0;
        outputTokens += numberValue(usage.outputTokens) ?? 0;
        totalTokens += numberValue(usage.totalTokens) ?? 0;
      }
    }
  } catch (error) {
    input.onEvent?.({ type: "agent_error", error: safePreview(error, 500), startedAt: now().toISOString(), endedAt: now().toISOString() });
    if (error instanceof MarketDiscoveryAgentError) throw error;
    if (error instanceof TavilyConfigurationError || error instanceof TavilySearchError) throw error;
    throw new MarketDiscoveryAgentError("agent_failed");
  }

  const output = validateOutput(structuredResponse, sources);
  input.onProgress?.({ stage: "synthesis", progress: 90, message: "Đã tổng hợp cơ hội có nguồn dẫn chứng" });
  return {
    opportunities: output.opportunities,
    sources: [...sources.values()],
    applicationPrompt: { system, user },
    usage: { inputTokens, outputTokens, totalTokens },
  };
}
