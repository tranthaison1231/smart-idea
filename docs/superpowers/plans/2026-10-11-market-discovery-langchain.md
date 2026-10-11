# Market Discovery LangChain Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed market-discovery synthesis path with a bounded LangChain agent that performs current web research through real tool calls, produces validated structured opportunities, and records every real model/tool span.

**Architecture:** Keep the existing repository, snapshot, preferences, cooldown, NDJSON progress route, and trace v2 contract. Add a server-only LangChain agent with bounded Tavily search/extract tools and a provider model factory that mirrors Smart Stock for API-key and ChatGPT Responses OAuth providers. The service owns persistence and maps LangChain stream events into the existing trace; the agent owns research decisions and structured output.

**Tech Stack:** Next.js Node runtime, TypeScript, `langchain` `createAgent`, `@langchain/core` tools/messages, `@langchain/openai` `ChatOpenAI`, Zod, existing Tavily HTTP adapter, Drizzle repository.

**Spec:** `docs/superpowers/specs/2026-10-11-market-discovery-langchain-design.md`

## Global Constraints

- Keep the Vietnamese-first interface and dark navy/coral tokens.
- Keep OAuth on `https://chatgpt.com/backend-api/codex` with `useResponsesApi: true`, `OpenAI-Beta: responses=v1`, `store: false`, and no `max_output_tokens`.
- Keep API-key HTTPS/public-DNS validation and existing credential boundaries.
- Search is bounded to at most 6 calls and extract to at most 3 URLs per run; no raw HTML or unbounded model context.
- Use `include_published_date: true`, current date in the prompt, `topic: news/general`, and `time_range` to prefer recent sources while labeling undated sources.
- Never persist hidden chain-of-thought, credentials, access tokens, or unredacted prompts; trace only stores application inputs/outputs, tool metadata, bounded results, timings, statuses, and errors.
- Preserve old feed data when a new search/model/validation run fails.

## Review Focus

- OAuth model construction must match Smart Stock and must not regress to the hand-built Responses request that caused previous 400/401/timeout errors. Test the exact configuration.
- Tool arguments must reject invalid topics/time ranges, overly long queries, too many URLs, and calls beyond the per-run budget. Test each bound.
- Current-source ranking must retain `publishedAt`/`fetchedAt`, distinguish undated sources, and never claim an undated result is latest. Test source normalization.
- Agent structured output must reject unknown source IDs, missing fields, invalid confidence, and more than five opportunities without deleting the previous feed. Test parser and service failure behavior.
- LangChain stream events must become accurate `llm_call`/`tool_call` spans with parent/run IDs and redacted previews; no synthetic or hidden reasoning spans. Test a multi-turn event fixture.

### Task 1: Add LangChain dependencies and provider model contract

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/web/src/_entities/market-discovery/server/market-discovery-agent.ts`
- Test: `apps/web/test/market-discovery-agent.test.mjs`

**Interfaces:**
- Produces `marketDiscoveryModelConfig(provider)` for API-key and OAuth provider settings.
- Produces `createMarketDiscoveryModel(provider)` and `MarketDiscoveryOpportunityOutputSchema`.
- Produces `MarketDiscoveryAgentEvent`, `MarketDiscoveryAgentInput`, and `MarketDiscoveryAgentResult` types used by later tasks.

- [ ] **Step 1: Write failing provider/config and schema tests**

  Add assertions that API-key config uses the provider model/base URL without OAuth headers, OAuth config uses `useResponsesApi: true`, the fixed Codex base URL, `OpenAI-Beta: responses=v1`, `store: false`, and no `max_output_tokens`; also assert the output schema has the required opportunity fields.

- [ ] **Step 2: Run the focused test and verify it fails**

  Run: `node --experimental-strip-types --test test/market-discovery-agent.test.mjs`

  Expected: FAIL because the LangChain module and exported contract do not exist.

- [ ] **Step 3: Add the minimum dependencies and provider/schema contract**

  Add `@langchain/core`, `@langchain/openai`, `langchain`, and `zod` to `apps/web`. Implement the config helper and Zod opportunity schema in the new server-only agent module; do not construct or call a model yet.

- [ ] **Step 4: Install and rerun the focused test**

  Run: `pnpm install --filter @smart-idea/web` then `node --experimental-strip-types --test test/market-discovery-agent.test.mjs`

  Expected: PASS for provider config and schema tests.

### Task 2: Make Tavily a bounded, freshness-aware tool backend

**Files:**
- Modify: `apps/web/src/_entities/market-discovery/server/tavily-search.ts`
- Modify: `apps/web/src/_entities/market-discovery/model/market-discovery.ts` (only if source metadata needs a typed freshness field)
- Test: `apps/web/test/market-discovery-agent.test.mjs`

**Interfaces:**
- Produces `tavilySearchQuery(options, onCall?)` for one agent invocation.
- Produces `tavilyExtractSources(urls, onCall?)` with a three-URL maximum.
- Preserves the existing `tavilySearch(queries?, onCall?)` compatibility wrapper until all callers migrate.

- [ ] **Step 1: Add failing tool-bound and freshness tests**

  Mock `fetch` and assert the search body contains `topic`, `time_range`, `include_published_date: true`, `filter_by_published_date: false`, language/country preference, and bounded `max_results`; assert invalid query, topic, time range, and URL count fail before network access.

- [ ] **Step 2: Run the focused test and verify it fails**

  Run: `node --experimental-strip-types --test test/market-discovery-agent.test.mjs`

  Expected: FAIL because the new per-call functions/options do not exist.

- [ ] **Step 3: Implement the smallest safe Tavily adapter**

  Refactor the existing bounded HTTP helpers into one-query and extract functions. Keep HTTPS URL validation, response-size limits, 15-second request timeout, result URL deduplication, and `TavilySearchCall` trace callback. Store `publishedAt` and fetch time; do not include answer/raw HTML.

- [ ] **Step 4: Run the focused tests**

  Run: `node --experimental-strip-types --test test/market-discovery-agent.test.mjs`

  Expected: PASS for tool request shape and bounds.

### Task 3: Implement the bounded LangChain research agent

**Files:**
- Modify: `apps/web/src/_entities/market-discovery/server/market-discovery-agent.ts`
- Test: `apps/web/test/market-discovery-agent.test.mjs`

**Interfaces:**
- `runMarketDiscoveryAgent(input: MarketDiscoveryAgentInput): Promise<MarketDiscoveryAgentResult>`
- `MarketDiscoveryAgentInput` includes the validated provider, preferences, market date, abort signal, and `onEvent`/`onProgress` callbacks.
- `MarketDiscoveryAgentResult` includes validated `opportunities`, collected `sources`, and bounded usage metadata.
- `MarketDiscoveryAgentDependencies` optionally injects `model`, `searchTool`, `extractTool`, `agentFactory`, and `now` for deterministic tests; production uses the provider model and real Tavily tools.

- [ ] **Step 1: Write failing agent-loop tests**

  Use an injected fake model/agent runner to emit two model turns, three tool calls, one extract call, and a final structured response. Assert all events are forwarded, tools receive validated arguments, calls stop at the budget, and invalid structured output rejects.

- [ ] **Step 2: Run the focused test and verify it fails**

  Run: `node --experimental-strip-types --test test/market-discovery-agent.test.mjs`

  Expected: FAIL because the runner and event mapper are not implemented.

- [ ] **Step 3: Build the agent with current-date and source-grounding instructions**

  Create the `tool()` definitions with Zod schemas, closure-scoped source collection, six-search/three-extract counters, and bounded result previews. Build `ChatOpenAI` exactly from Task 1 for the selected provider, then call `createAgent` with `toolStrategy(MarketDiscoveryOpportunityOutputSchema)` as `responseFormat`. Prompt the agent to plan multiple research angles, use `news`/`general` and `month`/`year` deliberately, inspect source dates, extract only when needed, and cite only collected source IDs. Use the dependency injection contract for fake-model/tool tests without adding a production abstraction layer.

- [ ] **Step 4: Stream and normalize LangChain events**

  Consume `streamEvents` with the supported v2 contract. Map model start/end/error, tool start/end/error, and agent chain lifecycle into the typed `MarketDiscoveryAgentEvent`; emit progress messages without exposing token text or hidden reasoning. Read `structuredResponse` from the final result and run the existing domain validator before returning.

- [ ] **Step 5: Run the focused tests**

  Run: `node --experimental-strip-types --test test/market-discovery-agent.test.mjs`

  Expected: PASS for multi-turn orchestration, bounds, structured output, and event forwarding.

### Task 4: Replace the fixed service synthesis/search path and persist real spans

**Files:**
- Modify: `apps/web/src/_entities/market-discovery/server/market-discovery-service.ts`
- Modify: `apps/web/src/_entities/market-discovery/model/market-discovery-trace.ts`
- Modify: `apps/web/src/_entities/market-discovery/server/market-discovery-repository.ts` only if run reservation needs the pending-snapshot lifecycle
- Test: `apps/web/test/market-discovery-trace.test.mjs`

**Interfaces:**
- Service calls `runMarketDiscoveryAgent` once per claimed run and remains the only owner of snapshot/run persistence.
- Trace mapper accepts `MarketDiscoveryAgentEvent` and creates one span per actual model/tool invocation with event parent IDs.

- [ ] **Step 1: Add failing multi-span trace fixture**

  Extend the trace test with a fixture containing two `llm_call` events, three `tool_call` events, one `agent` root, and progress events; assert counts, parent IDs, redaction, and exported `{ exported_at, trace, spans }` shape.

- [ ] **Step 2: Run the trace test and verify it fails**

  Run: `node --experimental-strip-types --test test/market-discovery-trace.test.mjs`

  Expected: FAIL until the mapper/service uses agent events.

- [ ] **Step 3: Integrate the agent into refresh**

  Reserve the pending snapshot/run before the agent so trace IDs are stable. On success, complete the snapshot with collected sources and the run with validated opportunities. On failure, fail the pending snapshot/run, mark the trace failed, and leave prior ready feed rows untouched. Remove market discovery’s direct `completeTextWithProvider` synthesis call and fixed query call.

- [ ] **Step 4: Map real stream events into trace v2**

  Preserve application prompt metadata in redacted form, attach run/parent IDs, record provider/model and bounded output metadata, and keep `span_count`, `llm_call_count`, and `tool_call_count` synchronized. Do not create a span for a progress label or store model hidden reasoning.

- [ ] **Step 5: Run focused tests**

  Run: `node --experimental-strip-types --test test/market-discovery-trace.test.mjs test/market-discovery-agent.test.mjs`

  Expected: PASS with the new multi-turn fixture and existing v1 normalization tests.

### Task 5: Verify route/UI compatibility and production checks

**Files:**
- Modify: `apps/web/src/_features/market-discovery/ui/market-discovery-feed.tsx` only if new progress labels need copy/ordering changes.
- Modify: `apps/web/src/app/api/market-discovery/refresh/route.ts` only if event/error serialization needs a bounded field.

**Interfaces:**
- Keep the existing NDJSON `{ type: "progress", stage, progress, message }` and `{ type: "complete" | "error" }` contract.

- [ ] **Step 1: Add/adjust a route contract assertion**

  Assert progress messages remain bounded Vietnamese strings, percentages stay monotonic between 0 and 100, and provider/tool failures serialize as existing error codes without source payloads.

- [ ] **Step 2: Run the full verification suite**

  Run:

  ```bash
  pnpm --filter @smart-idea/web typecheck
  pnpm --filter @smart-idea/database typecheck
  pnpm --filter @smart-idea/web lint
  node --experimental-strip-types --test test/market-discovery-agent.test.mjs test/market-discovery-trace.test.mjs test/market-discovery-preferences.test.mjs
  pnpm --filter @smart-idea/web build
  git diff --check
  ```

  Expected: all commands pass; a live provider refresh is not required for the automated suite and must not be run with production credentials during tests.

- [ ] **Step 3: Review the final diff**

  Confirm only market-discovery LangChain files, dependency lockfile, tests, and the approved spec/plan changed; verify no secrets, raw HTML, hidden reasoning, or unrelated UI changes entered the diff.

