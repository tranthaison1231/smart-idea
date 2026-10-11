import "server-only";

import {
  AiCompletionError,
  validateProviderForInference,
} from "@/_entities/ai-provider/server/complete-text";
import {
  AiProviderCredentialUnavailableError,
  AiProviderNotConfiguredError,
  providerRepository,
} from "@/_entities/ai-provider/index.server";
import { ideaRepository } from "@/_entities/idea/index.server";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, marketDiscoveryOpportunities } from "@smart-idea/database/server";
import {
  MarketDiscoveryError,
  type MarketDiscoveryFeed,
  type OpportunityDraft,
} from "../model/market-discovery";
import {
  DEFAULT_MARKET_DISCOVERY_PREFERENCES,
  type MarketDiscoveryPreferences,
} from "../model/market-discovery-preferences";
import {
  DISCOVERY_QUERY_VERSION,
  marketDiscoveryRepository,
  type MarketDiscoverySnapshot,
  vietnamMarketDate,
} from "./market-discovery-repository";
import { TavilyConfigurationError, TavilySearchError } from "./tavily-search";
import {
  MarketDiscoveryAgentError,
  runMarketDiscoveryAgent,
} from "./market-discovery-agent";
import type { MarketDiscoveryTrace, MarketDiscoveryTraceSpan } from "../model/market-discovery-trace";
import { appendMarketDiscoveryAgentEvent, appendMarketDiscoveryProgress, preview, redactTraceText } from "../model/market-discovery-trace";

export type MarketDiscoveryProgress = {
  stage: "provider" | "sources" | "synthesis" | "saving" | "complete";
  progress: number;
  message: string;
};

type MarketDiscoveryProgressCallback = (progress: MarketDiscoveryProgress) => void;

type DiscoveryProvider = Awaited<ReturnType<typeof getProvider>>;

type DiscoverySnapshot = Pick<MarketDiscoverySnapshot, "id" | "state">;

function createTrace(): MarketDiscoveryTrace {
  const startedAt = new Date().toISOString();
  const id = `market-discovery-${Date.now()}`;
  const root: MarketDiscoveryTraceSpan = {
    id: `${id}-agent`,
    trace_id: id,
    parent_span_id: null,
    agent_id: "market-discovery",
    span_type: "agent",
    name: "market-discovery",
    start_time: startedAt,
    end_time: null,
    duration_ms: null,
    status: "running",
    input_preview: "",
    output_preview: "",
    metadata: {},
    created_at: startedAt,
  };
  return {
    version: 2,
    id,
    agent_id: "market-discovery",
    session_key: "market-discovery",
    run_id: id,
    start_time: startedAt,
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
    created_at: startedAt,
    spans: [root],
    events: [],
  };
}

function syncTraceCounts(trace: MarketDiscoveryTrace) {
  trace.span_count = trace.spans.length;
  trace.llm_call_count = trace.spans.filter((span) => span.span_type === "llm_call").length;
  trace.tool_call_count = trace.spans.filter((span) => span.span_type === "tool_call").length;
}

function bindTraceRun(trace: MarketDiscoveryTrace, runId: string) {
  trace.run_id = runId;
  trace.id = runId;
  for (const span of trace.spans) span.trace_id = runId;
  const root = trace.spans.find((span) => span.span_type === "agent");
  if (root) root.id = `${runId}-agent`;
}

function completeTrace(trace: MarketDiscoveryTrace, status: "completed" | "failed", code?: string) {
  const endedAt = new Date().toISOString();
  trace.status = status;
  trace.end_time = endedAt;
  trace.duration_ms = Math.max(0, Date.parse(endedAt) - Date.parse(trace.start_time));
  trace.error = code ?? null;
  const root = trace.spans.find((span) => span.span_type === "agent");
  if (root) {
    root.status = status;
    root.end_time = endedAt;
    root.duration_ms = trace.duration_ms;
    root.output_preview = trace.output_preview;
  }
  for (const span of trace.spans) {
    if (span.status === "running") {
      span.status = status === "failed" ? "failed" : "completed";
      span.end_time ??= endedAt;
      span.duration_ms ??= Math.max(0, Date.parse(span.end_time) - Date.parse(span.start_time));
    }
  }
  for (const event of trace.events) {
    if (event.status === "running") {
      event.status = status === "failed" ? "failed" : "completed";
      event.end_time ??= endedAt;
      event.duration_ms ??= Math.max(0, Date.parse(event.end_time) - Date.parse(event.start_time));
    }
  }
  syncTraceCounts(trace);
}

async function getProvider(ownerId: string) {
  try {
    const provider = await providerRepository.getEnabledForInference(ownerId);
    await validateProviderForInference(provider);
    return provider;
  } catch (error) {
    if (error instanceof AiProviderNotConfiguredError) {
      throw new MarketDiscoveryError("provider_not_configured", 409);
    }
    if (error instanceof AiProviderCredentialUnavailableError) {
      throw new MarketDiscoveryError("provider_credentials_unavailable", 409);
    }
    if (error instanceof AiCompletionError) throw new MarketDiscoveryError(error.code, 502);
    throw new MarketDiscoveryError("provider_unavailable", 502);
  }
}

function discoveryError(error: unknown): MarketDiscoveryError {
  if (error instanceof MarketDiscoveryError) return error;
  if (error instanceof TavilyConfigurationError) return new MarketDiscoveryError("tavily_not_configured", 503);
  if (error instanceof TavilySearchError) return new MarketDiscoveryError("source_search_failed", 502);
  if (error instanceof MarketDiscoveryAgentError) return new MarketDiscoveryError(error.code, 502);
  return new MarketDiscoveryError("provider_unavailable", 502);
}

async function runAgent(
  ownerId: string,
  provider: DiscoveryProvider,
  snapshot: DiscoverySnapshot,
  stale: boolean,
  preferences: MarketDiscoveryPreferences,
  marketDate: string,
  trace: MarketDiscoveryTrace,
  onProgress?: MarketDiscoveryProgressCallback,
) {
  const reservation = await marketDiscoveryRepository.reserveRun(
    ownerId,
    snapshot.id,
    provider.providerType,
    provider.model,
    stale,
  );
  if (reservation.run.state === "ready") return { state: "ready" as const };
  if (!reservation.claimed) return { state: "processing" as const };

  bindTraceRun(trace, reservation.run.id);
  trace.metadata = {
    ...trace.metadata,
    provider: { type: provider.providerType, model: provider.model },
    market_date: marketDate,
    preferences: JSON.parse(redactTraceText(JSON.stringify(preferences))),
  };
  trace.input_preview = redactTraceText(preview({ marketDate, preferences }));
  const root = trace.spans.find((span) => span.span_type === "agent");
  if (root) root.input_preview = trace.input_preview;

  try {
    onProgress?.({ stage: "sources", progress: 20, message: "Agent đang lập kế hoạch tìm nguồn mới..." });
    const result = await runMarketDiscoveryAgent({
      provider,
      preferences,
      marketDate,
      onEvent: (event) => {
        appendMarketDiscoveryAgentEvent(trace, {
          ...event,
          metadata: {
            ...event.metadata,
            provider: provider.providerType,
            model: provider.model,
          },
        });
      },
      onProgress: (progress) => {
        appendMarketDiscoveryProgress(trace, progress);
        onProgress?.(progress);
      },
    });
    if (!result.sources.length) throw new MarketDiscoveryError("no_market_evidence", 502);

    trace.output_preview = redactTraceText(preview({ opportunities: result.opportunities }));
    trace.metadata = {
      ...trace.metadata,
      application_prompt: {
        system: redactTraceText(result.applicationPrompt.system),
        user: redactTraceText(result.applicationPrompt.user),
      },
      source_count: result.sources.length,
      opportunity_count: result.opportunities.length,
      usage: result.usage ?? null,
    };
    const resultRoot = trace.spans.find((span) => span.span_type === "agent");
    if (resultRoot) resultRoot.output_preview = trace.output_preview;
    onProgress?.({ stage: "saving", progress: 92, message: "Đang lưu kết quả vào lịch sử khám phá..." });
    onProgress?.({ stage: "complete", progress: 100, message: "Đã hoàn tất khám phá và lưu kết quả." });
    completeTrace(trace, "completed");
    await marketDiscoveryRepository.completeAgentRun(
      reservation.run.id,
      ownerId,
      snapshot.id,
      result.sources,
      result.opportunities,
      trace,
    );
    return { state: "ready" as const };
  } catch (error) {
    const mapped = discoveryError(error);
    console.error("[market-discovery] agent run failed", {
      providerType: provider.providerType,
      model: provider.model,
      errorCode: mapped.code,
      ...(error instanceof AiCompletionError && error.diagnostic ? { diagnostic: error.diagnostic } : {}),
    });
    if (snapshot.state === "pending") await marketDiscoveryRepository.failSnapshot(snapshot.id, mapped.code);
    completeTrace(trace, "failed", mapped.code);
    await marketDiscoveryRepository.failRun(reservation.run.id, ownerId, mapped.code, trace);
    throw mapped;
  }
}

export const marketDiscoveryService = {
  async getPreferences(ownerId: string): Promise<MarketDiscoveryPreferences> {
    const preferences = await marketDiscoveryRepository.findPreferences(ownerId);
    if (!preferences) return { ...DEFAULT_MARKET_DISCOVERY_PREFERENCES };
    return {
      markets: preferences.markets,
      topics: preferences.topics,
      revenueModels: preferences.revenueModels,
      customerSegments: preferences.customerSegments,
      hiddenTags: preferences.hiddenTags,
    };
  },

  savePreferences(ownerId: string, preferences: MarketDiscoveryPreferences) {
    return marketDiscoveryRepository.savePreferences(ownerId, preferences);
  },

  async getFeed(ownerId: string): Promise<MarketDiscoveryFeed> {
    const history = await marketDiscoveryRepository.listHistory(ownerId);
    return {
      history: history.map((run) => {
        const sourcesById = new Map(run.sources.map(({ id, title, url, domain, publishedAt }) => [
          id,
          { id, title, url, domain, publishedAt },
        ]));
        return {
          id: run.id,
          marketDate: run.marketDate,
          createdAt: run.createdAt.toISOString(),
          fetchedAt: run.fetchedAt?.toISOString() ?? null,
          stale: run.stale,
          providerType: run.providerType,
          providerModel: run.providerModel,
          traceAvailable: run.traceAvailable,
          opportunities: run.opportunities.map((opportunity) => ({
            id: opportunity.id,
            productName: opportunity.productName,
            problem: opportunity.problem,
            targetCustomer: opportunity.targetCustomer,
            solution: opportunity.solution,
            whyNow: opportunity.whyNow,
            revenueModels: opportunity.revenueModels,
            confidence: opportunity.confidence as OpportunityDraft["confidence"],
            confidenceRationale: opportunity.confidenceRationale,
            sourceIds: opportunity.sourceIds,
            savedIdeaId: opportunity.savedIdeaId,
            sources: opportunity.sourceIds.flatMap((id) => {
              const source = sourcesById.get(id);
              return source ? [source] : [];
            }),
          })),
        };
      }),
    };
  },

  async getTrace(ownerId: string, runId: string) {
    return marketDiscoveryRepository.findTrace(ownerId, runId);
  },

  async refresh(ownerId: string, mode: "daily" | "manual", onProgress?: MarketDiscoveryProgressCallback) {
    const trace = createTrace();
    const reportProgress: MarketDiscoveryProgressCallback = (progress) => {
      appendMarketDiscoveryProgress(trace, progress);
      onProgress?.(progress);
    };
    reportProgress({ stage: "provider", progress: 8, message: "Đang kiểm tra Provider AI..." });
    const provider = await getProvider(ownerId);
    const preferences = await this.getPreferences(ownerId);
    const marketDate = vietnamMarketDate();
    trace.metadata = {
      provider: { type: provider.providerType, model: provider.model },
      mode,
      market_date: marketDate,
      preferences: JSON.parse(redactTraceText(JSON.stringify(preferences))),
    };
    trace.input_preview = redactTraceText(preview({ mode, marketDate, preferences, queryVersion: DISCOVERY_QUERY_VERSION }));
    const root = trace.spans.find((span) => span.span_type === "agent");
    if (root) root.input_preview = trace.input_preview;
    reportProgress({ stage: "provider", progress: 15, message: "Provider AI đã sẵn sàng." });

    const reservation = mode === "daily"
      ? await marketDiscoveryRepository.reserveDailySnapshot(marketDate)
      : await marketDiscoveryRepository.reserveManualSnapshot(ownerId, marketDate);
    const snapshot = reservation.snapshot;
    if (!reservation.claimed) {
      if (snapshot.state === "pending" && snapshot.leaseExpiresAt && snapshot.leaseExpiresAt > new Date()) {
        return { state: "processing" as const };
      }
      if (snapshot.state !== "ready") return { state: "processing" as const };
    }

    const result = await runAgent(ownerId, provider, snapshot, false, preferences, marketDate, trace, reportProgress);
    if (result.state === "processing") return result;
    return { state: "ready" as const, feed: await this.getFeed(ownerId) };
  },

  async saveOpportunityAsIdea(ownerId: string, opportunityId: string) {
    return getDb().transaction(async (tx) => {
      const [opportunity] = await tx
        .select()
        .from(marketDiscoveryOpportunities)
        .where(and(
          eq(marketDiscoveryOpportunities.id, opportunityId),
          eq(marketDiscoveryOpportunities.ownerId, ownerId),
        ))
        .for("update")
        .limit(1);
      if (!opportunity) return null;
      if (opportunity.savedIdeaId) return opportunity.savedIdeaId;

      const ideaId = await ideaRepository.createForOwnerInTransaction(tx, ownerId, {
        name: opportunity.productName,
        description: opportunity.whyNow,
        industry: null,
        problem: opportunity.problem,
        targetCustomer: opportunity.targetCustomer,
        solution: opportunity.solution,
        revenueModels: opportunity.revenueModels,
      });
      await tx
        .update(marketDiscoveryOpportunities)
        .set({ savedIdeaId: ideaId })
        .where(and(
          eq(marketDiscoveryOpportunities.id, opportunityId),
          eq(marketDiscoveryOpportunities.ownerId, ownerId),
          isNull(marketDiscoveryOpportunities.savedIdeaId),
        ));
      return ideaId;
    });
  },
};
