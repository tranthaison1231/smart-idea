# Idea Competitor Research Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add evidence-backed AI competitor research to each Idea, with a reviewable draft and an explicit atomic replacement of saved competitors.

**Architecture:** Store competitors in a one-to-many Drizzle table owned through the parent Idea. A server-only service reuses Tavily, the enabled user AI provider, and a short-lived HMAC proof so drafts remain out of the database until Save. Two authenticated route handlers provide research and replacement; an interactive feature renders saved and unsaved tables inside the existing detail tab.

**Tech Stack:** Next.js 16.3.2 App Router, React 19.2.8, Drizzle ORM 0.45.3/Postgres, existing Tavily and AI provider services, Node crypto, shadcn UI, Sonner.

**Spec:** `docs/superpowers/specs/2026-10-11-idea-competitor-research-design.md`

## Global Constraints

- Require the signed-in app user and verify Idea ownership on the server for research, read, and save.
- Generate no more than five competitors from at most 20 normalized Tavily sources; every competitor needs one to five source records from that research response.
- Research and refresh keep drafts in client state; only Save writes or replaces database rows.
- A successful Save atomically replaces the Idea's full competitor list; a failed save preserves the previous list.
- Use the current user's enabled AI provider and platform Tavily key; credentials stay server-side.
- Bind the normalized draft, user, Idea, and expiry to a purpose-specific HMAC derived from `BETTER_AUTH_SECRET`.
- Persist only HTTPS evidence links with no embedded credentials; do not fetch arbitrary browser-supplied URLs.
- Reuse existing dependencies and shadcn/Sonner components; do not add a test runner or other package.
- Read the relevant Next.js 16 guides in `apps/web/node_modules/next/dist/docs/` before editing Next.js route or component files.
- Preserve existing unrelated working-tree changes, including existing edits to `idea-detail-page.tsx`; do not stage or commit their hunks with this feature.

## Review Focus

- Invalid or foreign Idea IDs must resolve to the same not-found response and must not trigger Tavily or AI calls. Check in Task 3.
- Missing provider or Tavily configuration must return a safe actionable error and leave both saved rows and draft unchanged. Check in Tasks 2–4.
- Invalid AI JSON, duplicate competitors, or source IDs outside the Tavily result set must not produce a draft. Check in Task 2.
- Expired, tampered, or cross-user/cross-Idea draft proofs must be rejected before deleting saved rows. Check in Task 3.
- Failed or concurrent replacement attempts must not lose or combine competitor lists. Check the owner-scoped row lock and transaction in Task 1.

The repository has no test script or test dependency. Keep this plan to typecheck, lint, migration inspection, and code review; do not add or run tests without a separate request.

---

### Task 1: Add competitor persistence and owner-scoped repository

**Files:**
- Create: `packages/database/src/schema/idea-competitors.ts`
- Modify: `packages/database/src/index.server.ts`
- Create: `apps/web/src/_entities/idea-competitor/server/idea-competitor-repository.ts`
- Create: `apps/web/src/_entities/idea-competitor/index.server.ts`
- Generate: next Drizzle migration and snapshot under `drizzle/`

**Interfaces:**
- `IdeaCompetitorInsert = Omit<typeof ideaCompetitors.$inferInsert, "id" | "ideaId" | "createdAt">`.
- `ideaCompetitorRepository.listByIdeaForOwner(ideaId, ownerId): Promise<IdeaCompetitor[]>` returns only rows joined through an Idea owned by `ownerId`.
- `ideaCompetitorRepository.replaceForOwner(ideaId, ownerId, competitors: IdeaCompetitorInsert[]): Promise<IdeaCompetitor[] | null>` locks the owned parent Idea row, replaces rows in one transaction, and returns `null` when the Idea is not owned.

- [ ] Define `idea_competitors` with UUID ID, cascading `idea_id`, all fields and nullability from the spec, non-null text arrays defaulting to empty arrays, JSONB `MarketSourceRecord[]`, and `created_at`; add the `idea_id` index.
- [ ] Export the schema from `packages/database/src/index.server.ts`; expose the repository and public types through the new entity `index.server.ts`.
- [ ] Implement owner-scoped list and replacement queries. Acquire `FOR UPDATE` on the `(ideas.id, ideas.user_id)` row before replacement so concurrent saves serialize; keep delete and insert in the same transaction.
- [ ] Run `pnpm db:generate`, inspect the generated migration/snapshot for only the new table and index, then run `pnpm --filter @smart-idea/database typecheck`.
- [ ] Apply the generated local migration with `pnpm db:migrate` when `DATABASE_URL` is configured; confirm the new table and index are present.

### Task 2: Implement Tavily-backed research, AI validation, and draft proof

**Files:**
- Modify: `apps/web/src/_entities/market-discovery/server/tavily-search.ts`
- Create: `apps/web/src/_entities/idea-competitor/model/competitor-research.ts`
- Create: `apps/web/src/_entities/idea-competitor/index.ts`
- Create: `apps/web/src/_entities/idea-competitor/server/competitor-draft-proof.ts`
- Create: `apps/web/src/_entities/idea-competitor/server/competitor-research-service.ts`
- Modify: `apps/web/src/_entities/idea-competitor/index.server.ts`

**Interfaces:**
- `CompetitorDraft`: `companyName`, `productName`, `website`, `overview`, `targetCustomer`, `keyFeatures`, `pricing`, `strengths`, `weaknesses`, and `sources`.
- `IdeaCompetitorView`: `CompetitorDraft` plus persisted `id` and ISO `createdAt`, safe to pass to a Client Component.
- `CompetitorResearchDraft`: `{ competitors: CompetitorDraft[]; proof: { expiresAt: number; signature: string } }`.
- `competitorResearchService.researchForOwner(ownerId, ideaId): Promise<CompetitorResearchDraft>` verifies ownership and provider configuration, searches, synthesizes, validates, and signs the result without database writes.
- `competitorResearchService.saveForOwner(ownerId, ideaId, draft: unknown): Promise<IdeaCompetitor[] | null>` verifies proof/expiry and normalized input, then delegates full replacement to Task 1.
- Extend `tavilySearch(queries?: readonly string[]): Promise<MarketSourceRecord[]>`; no-argument calls retain the existing market-discovery query behavior.

- [ ] Extend Tavily search to accept up to three bounded Idea-derived queries while preserving the existing no-argument caller; normalize, deduplicate, require HTTPS, and cap results at 20.
- [ ] Derive up to three unique queries of at most 240 characters from Idea name, industry, problem, customer, and solution; require the Idea and current enabled provider before calling Tavily.
- [ ] Use `providerRepository.getEnabledForInference`, `validateProviderForInference`, and `completeTextWithProvider`; do not fall back to a different provider.
- [ ] Parse strict JSON with at most five distinct company names. Enforce these limits: company/product 160 characters, overview 1,200, target customer 700, pricing 400, eight features of 160 characters, five strengths and five weaknesses of 300 characters each, and one to five source IDs. Require every source ID to exist in the Tavily response, attach canonical source records server-side, and leave unsupported values empty.
- [ ] Accept `website` only when it is an HTTPS URL equal to one of the returned source URLs; otherwise set the optional website to null.
- [ ] Add a Vietnamese system prompt that treats source text as untrusted and forbids unsupported claims. Limit model output to 8,000 tokens and 60,000 characters; map existing provider/Tavily errors to stable competitor-research error codes without logging credentials or raw source content.
- [ ] Sign a canonical hash of the validated draft plus owner ID, Idea ID, and 15-minute expiry using a purpose-derived HMAC key from `BETTER_AUTH_SECRET`; verify with constant-time signature comparison.
- [ ] Run web typecheck and lint; review all existing `tavilySearch()` callers to confirm no behavior change.

### Task 3: Add authenticated research and replacement endpoints

**Files:**
- Create: `apps/web/src/app/api/ideas/[id]/competitors/research/route.ts`
- Create: `apps/web/src/app/api/ideas/[id]/competitors/route.ts`

**Interfaces:**
- `POST /api/ideas/:id/competitors/research` accepts no request body and returns `{ competitors, proof }` with `Cache-Control: no-store`.
- `PUT /api/ideas/:id/competitors` accepts only `{ competitors, proof }`, verifies and saves the signed draft, and returns `{ competitors }` with `Cache-Control: no-store`.
- Return 401 for unauthenticated access, 404 for invalid/unowned Ideas, 400 for malformed/expired/tampered drafts, safe 409 for missing configuration, and safe 502/503 for upstream failures.

- [ ] Read the Next.js 16 Route Handler guide; implement Node.js route handlers using the current `getCurrentAppUser()` pattern and Promise-based route params.
- [ ] Validate UUID path IDs before service calls; derive owner identity only from the session and never accept owner IDs in bodies.
- [ ] Bound the PUT body to 128 KiB, reject unknown keys, and delegate exact draft/proof validation to the service before replacement.
- [ ] Return `no-store` responses and safe error codes only; do not include provider credentials, Tavily responses, or exception details.
- [ ] Run web typecheck and lint; review status handling against the Review Focus cases above.

### Task 4: Render saved and draft competitor tables in the Idea detail tab

**Files:**
- Modify: `apps/web/src/_pages/ideas/ui/idea-detail-page.tsx`
- Create: `apps/web/src/_features/idea-competitors/index.ts`
- Create: `apps/web/src/_features/idea-competitors/ui/idea-competitors-panel.tsx`

**Interfaces:**
- `IdeaCompetitorsPanel({ ideaId, savedCompetitors }: { ideaId: string; savedCompetitors: IdeaCompetitorView[] })` receives server-loaded safe competitor DTOs and owns only temporary browser draft/loading/error state.
- `IdeaDetailPage` loads competitors only for `tab=competitors`, using `ideaCompetitorRepository.listByIdeaForOwner`, then renders the panel. Other tabs keep their existing behavior.

- [ ] Read the relevant Next.js 16 Server/Client Component guide; load the saved list through the owner-scoped repository only when the competitors tab is active.
- [ ] Replace the competitor placeholder with the panel, exported through its feature `index.ts`; leave the overview, features, and research tabs unchanged.
- [ ] Use existing shadcn Table, Card, Badge, Button, Dialog, and Skeleton components. Show saved rows and a separate **Kết quả chưa lưu** draft table with source links and access to all approved fields; wrap long text and allow horizontal table scroll on narrow screens.
- [ ] Show **Tìm kiếm đối thủ** before a draft; after a successful search show **Làm mới** and **Lưu**. Do not search automatically on mount. Preserve a previous draft on refresh failure and saved rows until a successful save.
- [ ] Confirm replacement when saved rows exist; disable duplicate actions while pending, show loading/skeleton feedback, and map provider/Tavily errors to Vietnamese copy with a hint to open Cài đặt when needed.
- [ ] On successful save, clear the draft, call `router.refresh()`, and show a rich top-right Sonner success toast. Open evidence links in a new tab with safe `rel` attributes.
- [ ] Run `pnpm --filter @smart-idea/web typecheck` and `pnpm --filter @smart-idea/web lint`; inspect that the active user only sees the server-loaded owned rows and that the UI makes replacement behavior clear.

## Execution Notes

- The user has previously selected Native/in-session implementation for Smart Idea work; use that choice after this plan is approved.
- The current working tree already has unrelated changes in the Idea list/detail and global CSS. Preserve them; `idea-detail-page.tsx` in particular already contains uncommitted changes.
- No new test infrastructure, manual test run, or automated test run is included unless the user separately requests testing/verification.
