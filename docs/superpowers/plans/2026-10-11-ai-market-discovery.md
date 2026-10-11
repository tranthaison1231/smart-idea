# AI Market Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an authenticated `/discover` feed that finds Vietnam product opportunities from Tavily evidence, synthesizes them with the current user's enabled AI provider, preserves history, and saves selected opportunities as Ideas.

**Architecture:** Store immutable Tavily snapshots separately from per-user discovery runs and opportunities. A shared daily snapshot limits repeated searches; a manual refresh creates an owner-scoped snapshot. A server-only service coordinates provider inference and persistence, while route handlers and a shadcn UI expose the feature.

**Tech Stack:** Next.js 16 route handlers and server/client components, Drizzle/Postgres, Node `fetch` and crypto, existing provider OAuth/credential helpers, installed shadcn components and Sonner.

**Spec:** `docs/superpowers/specs/2026-10-11-ai-market-discovery-design.md`

## Global Constraints

- Require an authenticated app user for every feed, refresh, detail, and save operation; derive owner ID from the session.
- Use `Asia/Ho_Chi_Minh` for the daily source snapshot key.
- Keep `TAVILY_API_KEY`, decrypted API keys, and OAuth tokens on the server; never return or log them.
- Reuse one bounded Tavily search batch per shared Vietnam date; manual refresh is owner-scoped and limited to once per hour.
- Generate at most five opportunities per run, and accept citations only when their source IDs belong to the input snapshot.
- Use OpenAI Chat Completions for configured API-key providers and the OpenAI Responses API with the current user's OAuth token for ChatGPT Subscription; never silently fall back to another provider.
- Require HTTPS for configured-provider requests, disable redirects, resolve and pin only public destination IPs, and preserve the provider hostname for TLS verification.
- Do not add dependencies or background jobs. Use existing Next.js, Drizzle, provider, Ideas, toast, and shadcn patterns.
- Keep all discovery history owner-scoped. Saving an opportunity must atomically create the Idea and set its `savedIdeaId`.
- Read the relevant Next.js 16 guides in `apps/web/node_modules/next/dist/docs/` again before changing Next.js route or component files.
- Preserve current uncommitted OAuth work, including Drizzle migration `0005`; generate discovery migration files at the next sequence without rewriting those files.

## Review Focus

- Concurrent opens on the same Vietnam date must not create duplicate shared source batches or duplicate per-user runs; the database reservation and processing state must make this observable.
- No enabled provider, missing Tavily key, expired OAuth, upstream timeout, or malformed AI JSON must produce a safe UI error and preserve older history; missing provider must not call Tavily.
- A user must not list, view, refresh, or save another user's discovery data or Ideas by changing request IDs.
- A configured provider URL that targets localhost, a private IP, or a non-HTTPS host must be rejected before a server-side request.
- Prompt-injection text or made-up source IDs in Tavily snippets must never become instructions or accepted citations.

---

### Task 1: Persist source snapshots and implement the Tavily client

**Files:**
- Create: `packages/database/src/schema/market-discovery.ts`
- Modify: `packages/database/src/client.ts`
- Modify: `packages/database/src/index.server.ts`
- Create: `apps/web/src/_entities/market-discovery/server/market-discovery-repository.ts`
- Create: `apps/web/src/_entities/market-discovery/server/tavily-search.ts`
- Create: `apps/web/src/_entities/market-discovery/index.server.ts`
- Modify: `.env.example`
- Modify: `README.md`
- Generate: next Drizzle SQL migration and snapshot under `drizzle/` (leave `0005` intact)

**Interfaces:**
- `MarketSource`: `{ id: string; title: string; url: string; domain: string; snippet: string; publishedAt: string | null }`.
- `MarketDiscoverySnapshot`: ID, Vietnam market date, scope (`daily` or `manual`), owner ID when manual, state (`pending`, `ready`, or `failed`), sources, fetched time, and lease expiry.
- `tavilySearch(query: string): Promise<MarketSource[]>`: call the fixed search endpoint with a server-side key, bounded timeout/body, and normalized HTTPS results.
- Repository methods reserve or load a daily snapshot by market date/query version; reserve or load an owner-scoped manual snapshot; and finalize/fail a reservation. A unique DB index plus reservation state prevents concurrent calls from creating duplicate batches.

- [x] Add Drizzle tables for snapshots, user runs, and opportunities. Use nullable owner IDs only for shared daily snapshots; cascade user-owned rows and set `savedIdeaId` to null when an Idea is deleted. Include the daily unique index and the owner/date indexes needed by the repository.
- [x] Add database schema registration/exports and generate the next migration. Inspect the generated diff to confirm it adds discovery tables without changing OAuth migration `0005`.
- [x] Implement Tavily request parsing with fixed Vietnamese search queries, one-credit/basic search settings, a bounded number of sources, `AbortSignal.timeout`, and strict response validation. Reject non-HTTPS or malformed source URLs.
- [x] Implement repository reservation states so the winner performs a search and other daily requests observe `pending`/`ready`; recover an expired reservation without leaving a permanent lock.
- [x] Add `TAVILY_API_KEY` to `.env.example` and document local configuration and migration commands in `README.md`.
- [x] Check: run `pnpm db:generate` with the project's configured `DATABASE_URL`, inspect the new migration, then run `pnpm --filter @smart-idea/database typecheck`.

### Task 2: Resolve the active provider and synthesize validated opportunities

**Files:**
- Modify: `apps/web/src/_entities/ai-provider/server/provider-repository.ts`
- Modify: `apps/web/src/_entities/ai-provider/index.server.ts`
- Create: `apps/web/src/_entities/ai-provider/server/complete-text.ts`
- Create: `apps/web/src/_entities/market-discovery/model/market-discovery.ts`
- Create: `apps/web/src/_entities/market-discovery/server/market-discovery-service.ts`
- Modify: `apps/web/src/_entities/market-discovery/index.server.ts`

**Interfaces:**
- `providerRepository.getEnabledForInference(ownerId)` returns one server-only active provider including its decrypted API key when applicable; it never returns credential material through the public provider DTO.
- `completeTextForOwner(ownerId, { systemPrompt, userPrompt, maxOutputTokens })` returns validated response text or a typed, secret-free configuration/upstream error.
- `OpportunityDraft`: `{ productName; problem; targetCustomer; solution; whyNow; revenueModels: string[]; confidence: "low" | "medium" | "high"; confidenceRationale; sourceIds: string[] }`.
- `marketDiscoveryService.getFeed(ownerId)` returns only that user's history.
- `marketDiscoveryService.refresh(ownerId, mode: "daily" | "manual")` returns `{ state: "ready" | "processing"; feed?: MarketDiscoveryFeed }` and follows the snapshot reservation rules from Task 1.

- [x] Add the server-only active-provider lookup: decrypt the enabled API key, or obtain a refreshed owner-scoped OAuth access token through `getValidOpenAiAccessToken`; do not expose secrets in provider views.
- [x] Implement bounded, non-streaming inference: `/chat/completions` for an OpenAI-compatible configured endpoint; `https://api.openai.com/v1/responses` for OAuth with the stored model, `store: false`, and a request timeout. For configured endpoints, reject non-HTTPS, redirects, loopback/private/reserved DNS answers; pin a validated public address for the TLS request.
- [x] Validate model output as strict JSON with no more than five opportunities. Every opportunity needs the spec fields, qualitative confidence and at least one source ID present in the snapshot. Normalize source references server-side rather than trusting model URLs.
- [x] Implement daily/manual orchestration: require a valid active provider before Tavily; use shared daily snapshots or owner-scoped manual snapshots; apply a one-hour per-user manual cooldown; reuse an existing successful run; retry failed synthesis from its saved snapshot; use the latest successful snapshot if Tavily fails and mark it stale.
- [x] Make source snippets explicit untrusted evidence in the system prompt. Persist provider type/model labels only; never persist or log API credentials or raw OAuth tokens.
- [x] Check: run `pnpm --filter @smart-idea/web typecheck` and `pnpm --filter @smart-idea/web lint`.

### Task 3: Add authenticated feed, refresh, and atomic save endpoints

**Files:**
- Create: `apps/web/src/app/api/market-discovery/feed/route.ts`
- Create: `apps/web/src/app/api/market-discovery/refresh/route.ts`
- Create: `apps/web/src/app/api/market-discovery/opportunities/[id]/save/route.ts`
- Modify: `apps/web/src/_entities/idea/server/idea-repository.ts`
- Modify: `apps/web/src/_entities/idea/index.server.ts`
- Modify: `apps/web/src/_entities/market-discovery/server/market-discovery-repository.ts`
- Modify: `apps/web/src/_entities/market-discovery/server/market-discovery-service.ts`

**Interfaces:**
- `GET /api/market-discovery/feed` returns `{ history: MarketDiscoveryRunView[] }` with `Cache-Control: no-store`.
- `POST /api/market-discovery/refresh` accepts only `{ mode: "daily" | "manual" }`; return 202 while a shared reservation is pending, 200 when ready, and a bounded safe error code otherwise.
- `POST /api/market-discovery/opportunities/:id/save` returns `{ ideaId }`; repeating the request returns the already-linked Idea ID.
- Add `ideaRepository.createForOwnerInTransaction(tx, ownerId, input)` and have existing `createForOwner` delegate to it, so the save coordinator can create an Idea and link the opportunity in one DB transaction.

- [x] Implement the three route handlers using the current API route pattern: session lookup, 401 for unauthenticated requests, strict body/path validation, no-store responses, and no exception or credential details in responses/logs.
- [x] Implement owner-scoped feed queries that join run, snapshot, and opportunity data without exposing another user's manual snapshots.
- [x] Implement atomic/idempotent save: lock the opportunity row by `(id, ownerId)`, return its existing `savedIdeaId` if present, otherwise map `productName` to `name`, `whyNow` to `description`, and problem/customer/solution/revenue labels to their matching Idea fields, create through the transaction-scoped Idea repository helper, then write `savedIdeaId` before commit.
- [x] Apply the manual cooldown server-side and return a retry time without creating another snapshot when the user is still in cooldown.
- [x] Check: run `pnpm --filter @smart-idea/web typecheck` and `pnpm --filter @smart-idea/web lint`; inspect route responses to confirm all are `no-store` and contain no provider secrets.

### Task 4: Build the `/discover` workspace page

**Files:**
- Modify: `apps/web/src/_app/config/navigation.ts`
- Create: `apps/web/src/app/(workspace)/discover/page.tsx`
- Create: `apps/web/src/_pages/discover/index.ts`
- Create: `apps/web/src/_pages/discover/ui/discover-page.tsx`
- Create: `apps/web/src/_features/market-discovery/index.ts`
- Create: `apps/web/src/_features/market-discovery/ui/market-discovery-feed.tsx`
- Create: `apps/web/src/_features/market-discovery/ui/opportunity-detail-dialog.tsx`

**Interfaces:**
- `DiscoverPage` is a server page guarded by `requireCurrentAppUser()` and renders a client feed using the safe `MarketDiscoveryFeed` DTO.
- The client loads `GET /feed`, invokes daily refresh on first mount, polls briefly while the server reports `processing`, and uses the same refresh endpoint with `mode: "manual"` for the refresh button.

- [x] Add **Khám phá** to the workspace navigation and wire `/discover` through the existing page-slice structure.
- [x] Render loading, empty, stale-source, provider/Tavily-not-configured, processing, and retryable-error states in Vietnamese using existing Card, Badge, Button, Dialog, and Sonner components.
- [x] Render opportunities grouped by discovery date with source links and dates; the detail dialog shows problem, customer, product, why now, revenue models, confidence rationale, and citations.
- [x] Save through the authenticated endpoint; on success show a rich success toast and navigate to `/ideas/:id`. Disable duplicate saves while the request is pending and reflect an already-saved Idea link.
- [x] Check: run web typecheck/lint and `pnpm build`.
- [ ] Manual browser/provider smoke: open `/discover`, refresh, reload to confirm history persists, save an opportunity, and confirm the Idea appears under `/ideas`.

## Execution Notes

- The implementation method is Native/in-session, matching the user's prior choice for this workspace.
- Do not stage or revert unrelated existing changes. The current working tree already contains OAuth implementation and migration `0005` work.
- Before public release, confirm Tavily permits a shared platform key for third-party end users; keep this as a deployment gate.
