import assert from "node:assert/strict";
import test from "node:test";

const agentModule = await import("../src/_entities/market-discovery/server/market-discovery-agent.ts");
const tavilyModule = await import("../src/_entities/market-discovery/server/tavily-search.ts");

const apiKeyProvider = {
  id: "provider-api",
  name: "OpenAI-compatible",
  providerType: "openai",
  baseUrl: "https://api.example.test/v1",
  model: "gpt-5-mini",
  credentialType: "api-key",
  apiKey: "api-key-value",
};

const oauthProvider = {
  id: "provider-oauth",
  name: "ChatGPT Subscription",
  providerType: "oauth",
  baseUrl: "https://ignored.example.test",
  model: "gpt-6-luna",
  credentialType: "oauth",
  accessToken: "oauth-token-value",
};

const preferences = {
  markets: ["Việt Nam"],
  topics: ["AI"],
  revenueModels: [],
  customerSegments: ["SME"],
  hiddenTags: { markets: [], topics: [], revenueModels: [], customerSegments: [] },
};

function source(id, title = id) {
  return {
    id,
    title,
    url: `https://example.com/${id}`,
    domain: "example.com",
    snippet: `Evidence for ${id}`,
    publishedAt: "2026-10-05",
    fetchedAt: "2026-10-11T12:00:00.000Z",
  };
}

test("market discovery API-key model config keeps the selected provider endpoint", () => {
  const config = agentModule.marketDiscoveryModelConfig(apiKeyProvider);
  assert.equal(config.apiKey, "api-key-value");
  assert.equal(config.model, "gpt-5-mini");
  assert.equal(config.useResponsesApi, false);
  assert.equal(config.configuration.baseURL, "https://api.example.test/v1");
  assert.equal(config.configuration.defaultHeaders, undefined);
  assert.equal(config.modelKwargs, undefined);
  assert.equal("max_output_tokens" in config, false);
});

test("market discovery OAuth config matches Smart Stock Codex Responses settings", () => {
  const config = agentModule.marketDiscoveryModelConfig(oauthProvider);
  assert.equal(config.apiKey, "oauth-token-value");
  assert.equal(config.model, "gpt-6-luna");
  assert.equal(config.useResponsesApi, true);
  assert.equal(config.configuration.baseURL, "https://chatgpt.com/backend-api/codex");
  assert.deepEqual(config.configuration.defaultHeaders, { "OpenAI-Beta": "responses=v1" });
  assert.deepEqual(config.modelKwargs, { store: false });
  assert.equal("max_output_tokens" in config, false);
});

test("market discovery structured output schema accepts grounded opportunity fields", () => {
  const parsed = agentModule.MarketDiscoveryOpportunityOutputSchema.parse({
    opportunities: [{
      productName: "SME cashflow workspace",
      problem: "SMEs cannot prepare current financial evidence quickly.",
      targetCustomer: "Vietnamese SMEs",
      solution: "A workflow that normalizes invoices and bank data.",
      whyNow: "Digital tax and credit workflows are expanding in 2026.",
      revenueModels: ["Subscription / SaaS"],
      confidence: "medium",
      confidenceRationale: "Two recent sources describe the same unmet workflow.",
      sourceIds: ["source-1"],
    }],
  });
  assert.equal(parsed.opportunities.length, 1);
  assert.equal(parsed.opportunities[0].sourceIds[0], "source-1");
});

test("Tavily search sends freshness and Vietnam bounds", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.TAVILY_API_KEY;
  let requestBody;
  process.env.TAVILY_API_KEY = "tavily-test-key";
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ results: [{
      title: "Recent market evidence",
      url: "https://example.com/evidence",
      content: "Evidence snippet",
      published_date: "2026-10-05",
    }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const sources = await tavilyModule.tavilySearchQuery({
      query: "Vietnam SME digital workflow",
      topic: "news",
      timeRange: "month",
      language: "vi",
      country: "vietnam",
      maxResults: 5,
    });
    assert.equal(sources.length, 1);
    assert.equal(sources[0].publishedAt, "2026-10-05");
    assert.equal(typeof sources[0].fetchedAt, "string");
    assert.equal(requestBody.api_key, "tavily-test-key");
    assert.equal(requestBody.topic, "news");
    assert.equal(requestBody.time_range, "month");
    assert.equal(requestBody.include_published_date, true);
    assert.equal(requestBody.filter_by_published_date, false);
    assert.equal(requestBody.language, "vi");
    assert.equal(requestBody.country, "vietnam");
    assert.equal(requestBody.max_results, 5);
    assert.equal(requestBody.include_answer, false);
    assert.equal(requestBody.include_raw_content, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = originalKey;
  }
});

test("Tavily tools reject invalid arguments and over-sized extract batches before network access", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.TAVILY_API_KEY;
  let calls = 0;
  process.env.TAVILY_API_KEY = "tavily-test-key";
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ results: [] }), { status: 200 });
  };
  try {
    await assert.rejects(() => tavilyModule.tavilySearchQuery({ query: "" }), tavilyModule.TavilySearchError);
    await assert.rejects(() => tavilyModule.tavilySearchQuery({ query: "valid", topic: "invalid" }), tavilyModule.TavilySearchError);
    await assert.rejects(() => tavilyModule.tavilySearchQuery({ query: "valid", timeRange: "forever" }), tavilyModule.TavilySearchError);
    await assert.rejects(() => tavilyModule.tavilyExtractSources([
      "https://example.com/1",
      "https://example.com/2",
      "https://example.com/3",
      "https://example.com/4",
    ]), tavilyModule.TavilySearchError);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = originalKey;
  }
});

test("bounded agent forwards multiple real model and tool events and returns grounded output", async () => {
  const events = [];
  const searchInputs = [];
  const extractInputs = [];
  const fakeSources = [source("source-1"), source("source-2"), source("source-3")];
  const result = await agentModule.runMarketDiscoveryAgent({
    provider: apiKeyProvider,
    preferences,
    marketDate: "2026-10-11",
    onEvent: (event) => events.push(event),
  }, {
    now: () => new Date("2026-10-11T12:00:00.000Z"),
    searchTool: async (input) => {
      searchInputs.push(input);
      return [fakeSources[searchInputs.length - 1] ?? fakeSources[0]];
    },
    extractTool: async (urls) => {
      extractInputs.push(urls);
      return [fakeSources[2]];
    },
    agentFactory: ({ tools }) => ({
      async *streamEvents() {
        yield { event: "on_chain_start", name: "market-discovery", run_id: "agent-1", parent_ids: [], data: { input: {} } };
        yield { event: "on_chat_model_start", name: "ChatOpenAI", run_id: "llm-1", parent_ids: ["agent-1"], data: { input: {} } };
        yield { event: "on_chat_model_end", name: "ChatOpenAI", run_id: "llm-1", parent_ids: ["agent-1"], data: { output: { usage_metadata: { input_tokens: 10, output_tokens: 5 } } } };
        await tools.find((tool) => tool.name === "tavily_search_market_sources").invoke({ query: "Vietnam SME AI news", topic: "news", timeRange: "month", maxResults: 8 });
        yield { event: "on_tool_start", name: "tavily_search_market_sources", run_id: "tool-1", parent_ids: ["agent-1"], data: { input: { query: "Vietnam SME AI news" } } };
        yield { event: "on_tool_end", name: "tavily_search_market_sources", run_id: "tool-1", parent_ids: ["agent-1"], data: { output: { count: 1 } } };
        yield { event: "on_chat_model_start", name: "ChatOpenAI", run_id: "llm-2", parent_ids: ["agent-1"], data: { input: {} } };
        await tools.find((tool) => tool.name === "tavily_search_market_sources").invoke({ query: "Vietnam SME AI general", topic: "general", timeRange: "year", maxResults: 8 });
        yield { event: "on_tool_start", name: "tavily_search_market_sources", run_id: "tool-2", parent_ids: ["agent-1"], data: { input: { query: "Vietnam SME AI general" } } };
        yield { event: "on_tool_end", name: "tavily_search_market_sources", run_id: "tool-2", parent_ids: ["agent-1"], data: { output: { count: 1 } } };
        await tools.find((tool) => tool.name === "tavily_extract_market_sources").invoke({ urls: ["https://example.com/source-1"] });
        yield { event: "on_tool_start", name: "tavily_extract_market_sources", run_id: "tool-3", parent_ids: ["agent-1"], data: { input: { urls: ["https://example.com/source-1"] } } };
        yield { event: "on_tool_end", name: "tavily_extract_market_sources", run_id: "tool-3", parent_ids: ["agent-1"], data: { output: { count: 1 } } };
        yield { event: "on_chat_model_end", name: "ChatOpenAI", run_id: "llm-2", parent_ids: ["agent-1"], data: { output: { usage_metadata: { input_tokens: 20, output_tokens: 15 } } } };
        yield { event: "on_chain_end", name: "market-discovery", run_id: "agent-1", parent_ids: [], data: { output: { structuredResponse: {
          opportunities: [{ productName: "SME AI workflow", problem: "A real problem", targetCustomer: "Vietnamese SMEs", solution: "A product", whyNow: "Recent evidence", revenueModels: ["Subscription"], confidence: "medium", confidenceRationale: "Grounded", sourceIds: ["source-1", "source-2", "source-3"] },
          ],
        } } } };
      },
    }),
  });

  assert.equal(result.opportunities.length, 1);
  assert.equal(result.sources.length, 3);
  assert.equal(searchInputs.length, 2);
  assert.equal(extractInputs.length, 1);
  assert.equal(events.filter((event) => event.type === "llm_start").length, 2);
  assert.equal(events.filter((event) => event.type === "tool_start").length, 3);
  assert.equal(events.find((event) => event.runId === "tool-3").toolName, "tavily_extract_market_sources");
  assert.equal(events.find((event) => event.runId === "llm-2").parentRunId, "agent-1");
});

test("adaptive agent can finish after one evidence search and records safe turn summaries", async () => {
  const events = [];
  const result = await agentModule.runMarketDiscoveryAgent({
    provider: apiKeyProvider,
    preferences,
    marketDate: "2026-10-11",
    onEvent: (event) => events.push(event),
  }, {
    searchTool: async () => [source("source-1")],
    extractTool: async () => [],
    agentFactory: ({ tools }) => ({
      async *streamEvents() {
        yield { event: "on_chain_start", name: "market-discovery", run_id: "agent-1", parent_ids: [], data: { input: {} } };
        yield { event: "on_chat_model_start", name: "ChatOpenAI", run_id: "llm-1", parent_ids: ["agent-1"], data: { input: {} } };
        yield { event: "on_chat_model_end", name: "ChatOpenAI", run_id: "llm-1", parent_ids: ["agent-1"], data: { output: {
          usage_metadata: { input_tokens: 10, output_tokens: 5 },
          tool_calls: [{ name: "tavily_search_market_sources", id: "call-1" }],
          response_metadata: { reasoning: { encrypted_content: "do-not-persist", summary: [{ type: "summary_text", text: "Đối chiếu tín hiệu gần đây." }] } },
        } } };
        await tools.find((tool) => tool.name === "tavily_search_market_sources").invoke({ query: "Vietnam SME AI", topic: "news", timeRange: "month", maxResults: 6 });
        yield { event: "on_tool_start", name: "tavily_search_market_sources", run_id: "tool-1", parent_ids: ["llm-1", "agent-1"], data: { input: { query: "Vietnam SME AI" } } };
        yield { event: "on_tool_end", name: "tavily_search_market_sources", run_id: "tool-1", parent_ids: ["llm-1", "agent-1"], data: { output: { count: 1 } } };
        yield { event: "on_chain_end", name: "market-discovery", run_id: "agent-1", parent_ids: [], data: { output: { structuredResponse: {
          opportunities: [{ productName: "SME AI workflow", problem: "A real problem", targetCustomer: "Vietnamese SMEs", solution: "A product", whyNow: "Recent evidence", revenueModels: ["Subscription"], confidence: "medium", confidenceRationale: "Grounded", sourceIds: ["source-1"] }],
        } } } };
      },
    }),
  });

  const llmStart = events.find((event) => event.type === "llm_start");
  const llmEnd = events.find((event) => event.type === "llm_end");
  assert.equal(result.opportunities.length, 1);
  assert.equal(events.filter((event) => event.type === "llm_start").length, 1);
  assert.equal(events.filter((event) => event.type === "tool_start").length, 1);
  assert.equal(llmStart.turnIndex, 1);
  assert.equal(llmEnd.turnIndex, 1);
  assert.deepEqual(llmEnd.requestedTools, ["tavily_search_market_sources"]);
  assert.equal(llmEnd.reasoningSummary, "Đối chiếu tín hiệu gần đây.");
  assert.match(llmEnd.decisionSummary, /tavily_search_market_sources/);
  assert.doesNotMatch(JSON.stringify(events), /do-not-persist|encrypted_content/);
});

test("bounded agent rejects structured output that cites an unknown source", async () => {
  await assert.rejects(() => agentModule.runMarketDiscoveryAgent({
    provider: apiKeyProvider,
    preferences,
    marketDate: "2026-10-11",
  }, {
    searchTool: async () => [source("source-1")],
    extractTool: async () => [],
    agentFactory: () => ({
      async *streamEvents() {
        yield { event: "on_chain_end", name: "market-discovery", run_id: "agent-1", parent_ids: [], data: { output: { structuredResponse: {
          opportunities: [{ productName: "Bad", problem: "Problem", targetCustomer: "Customer", solution: "Solution", whyNow: "Now", revenueModels: ["SaaS"], confidence: "low", confidenceRationale: "Weak", sourceIds: ["missing-source"] }],
        } } } };
      },
    }),
  }), agentModule.MarketDiscoveryAgentError);
});

test("bounded agent stops search execution after six calls", async () => {
  let searchCalls = 0;
  let budgetErrors = 0;
  const result = await agentModule.runMarketDiscoveryAgent({
    provider: apiKeyProvider,
    preferences,
    marketDate: "2026-10-11",
  }, {
    searchTool: async () => {
      searchCalls += 1;
      return [source("source-1")];
    },
    extractTool: async () => [],
    agentFactory: ({ tools }) => ({
      async *streamEvents() {
        const search = tools.find((tool) => tool.name === "tavily_search_market_sources");
        for (let index = 0; index < 7; index += 1) {
          try {
            await search.invoke({ query: `query-${index}`, topic: "general", timeRange: "month", maxResults: 8 });
          } catch (error) {
            if (error.code === "search_budget_exceeded") budgetErrors += 1;
          }
        }
        yield { event: "on_chain_end", name: "market-discovery", run_id: "agent-1", parent_ids: [], data: { output: { structuredResponse: {
          opportunities: [{ productName: "Bounded", problem: "Problem", targetCustomer: "Customer", solution: "Solution", whyNow: "Now", revenueModels: ["SaaS"], confidence: "low", confidenceRationale: "Bounded", sourceIds: ["source-1"] }],
        } } } };
      },
    }),
  });
  assert.equal(result.opportunities.length, 1);
  assert.equal(searchCalls, 6);
  assert.equal(budgetErrors, 1);
});
