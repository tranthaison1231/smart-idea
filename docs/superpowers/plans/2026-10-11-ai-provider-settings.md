# Smart Idea Provider AI Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Ship user-owned API-key provider configuration in a Settings dialog opened from the sidebar account area.

**Architecture:** Store provider metadata in Drizzle under `app_users`, encrypt API keys with a server-only AES-256-GCM helper, and expose owner-scoped Next.js route handlers. Add client state at the sidebar boundary to open the Settings dialog.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Drizzle ORM, PostgreSQL, pnpm, existing shadcn components, Node `crypto`.

**Spec:** [docs/superpowers/specs/2026-10-11-ai-provider-settings-design.md](../specs/2026-10-11-ai-provider-settings-design.md)

## Global Constraints

- Resolve the provider owner from `getCurrentAppUser()` on the server; never accept owner IDs from requests.
- Keep provider names and model lists from the approved spec; at most one row per owner can have `is_enabled = true`.
- Encrypt API keys with AES-256-GCM using `AI_CREDENTIALS_ENCRYPTION_KEY`; never return or log plaintext credentials.
- Keep this feature to configuration only; do not call providers or implement idea analysis.
- Reuse the installed shadcn components; use the installed `radix-ui` package for any missing `Select` or `Switch` primitive, without adding a dependency.
- Before writing Next.js code, read the relevant Next 16 guides in `apps/web/node_modules/next/dist/docs/` as required by `apps/web/AGENTS.md`.
- Do not add or run tests unless the user asks; verify with typecheck, lint, build, migration inspection, and the manual checks below.

## Review Focus

- Unauthenticated provider requests return `401` and expose no rows.
- A provider ID owned by another user cannot be read, updated, or deleted; updates/deletes return the same `404` used for a missing ID without changing any row.
- Updating with an omitted key preserves the encrypted key; an explicit clear removes it and cannot leave a keyless provider enabled.
- Invalid provider type, URL, model list, or selected model is rejected before database writes.
- Two overlapping enable requests still leave no more than one enabled provider for the owner, enforced by the database index as well as the transaction.

---

### Task 1: Add provider persistence and credential encryption

**Files:**
- Create: `packages/database/src/schema/ai-providers.ts`
- Create: `apps/web/src/_entities/ai-provider/server/credential-cipher.ts`
- Modify: `packages/database/src/client.ts`
- Modify: `packages/database/src/index.server.ts`
- Modify: `.env.example`
- Generate: `drizzle/*` migration and snapshot files

**Interfaces:**
- Export `aiProviders` with UUID `id`, `ownerId` FK to `appUsers.id` (`ON DELETE CASCADE`), `name`, `providerType`, `baseUrl`, nullable `apiKeyCiphertext`, `models text[]` defaulting to `[]`, `model`, `isEnabled` defaulting to `false`, `createdAt`, and `updatedAt`.
- Export `encryptCredential(plaintext: string): string` and `decryptCredential(envelope: string): string` from the server-only cipher module. Store `v1.<base64url nonce>.<base64url auth tag>.<base64url ciphertext>`; nonce is 12 bytes, tag is AES-GCM's 16 bytes, and the decoded environment key must be exactly 32 bytes.
- Add owner index, partial unique index on `ownerId WHERE isEnabled`, and partial unique index on `ownerId WHERE providerType = 'oauth'` for the next plan.
- `.env.example` documents `AI_CREDENTIALS_ENCRYPTION_KEY` and `openssl rand -base64 32`; it contains no real key.

- [ ] Define and export the Drizzle table and indexes; include the table in the `getDb()` schema.
- [ ] Implement strict version/key validation and AES-256-GCM encrypt/decrypt with generic errors that do not include plaintext, key, or ciphertext.
- [ ] Add the encryption key placeholder and generation instruction to `.env.example`.
- [ ] Run `pnpm db:generate`.
- [ ] Inspect the generated migration and confirm it only adds the provider table and indexes.
- [ ] Run `pnpm db:migrate` against the configured project database.
- [ ] Run `pnpm --filter @smart-idea/database typecheck`.
- [ ] Run `git diff --check`.
- [ ] Commit the schema, cipher, migration, and environment example together.

### Task 2: Add owner-scoped provider repository and API

**Files:**
- Create: `apps/web/src/_entities/ai-provider/server/provider-repository.ts`
- Create: `apps/web/src/_entities/ai-provider/server/provider-input.ts`
- Create: `apps/web/src/_entities/ai-provider/index.server.ts`
- Create: `apps/web/src/app/api/ai-assistant/providers/route.ts`

**Interfaces:**
- `AiProviderView` contains `id`, `name`, `providerType`, `baseUrl`, `models`, `model`, `isEnabled`, and `apiKeyConfigured`; it never contains ciphertext or plaintext.
- `AiProviderInput` contains `name`, `providerType`, `baseUrl`, optional `apiKey`, optional `clearApiKey`, `models`, `model`, and `isEnabled`. API-key provider values are `custom`, `anthropic`, `gemini`, `vertex`, `openrouter`, `groq`, `deepseek`, `mistral`, `xai`, `minimax`, `cohere`, and `perplexity`.
- `parseAiProviderInput(value: unknown): { id?: string; input: AiProviderInput } | null` accepts only those API-key types; trims text, enforces name 1–80 chars, an HTTP/HTTPS URL, API key at most 500 chars, model IDs 1–160 chars, and at most 100 unique models. `model` must be in `models`.
- `providerRepository.listByOwner(ownerId: string): Promise<AiProviderView[]>`, `createForOwner(ownerId: string, input: AiProviderInput): Promise<AiProviderView[]>`, `updateForOwner(ownerId: string, id: string, input: AiProviderInput): Promise<AiProviderView[] | null>`, and `deleteForOwner(ownerId: string, id: string): Promise<boolean>`.
- Routes: `GET` returns `{ providers, credentialsReady }` with `Cache-Control: no-store`; `PUT` creates/updates by ID and returns safe DTOs; `DELETE?id=...` deletes by owner-scoped ID.

- [ ] Read the relevant Next 16 route-handler and client-component guides.
- [ ] Implement the parser and repository with owner filters on every query.
- [ ] Implement `GET` with `getCurrentAppUser()`, `401` for no session, no-store headers, and only the safe DTO fields.
- [ ] Implement `PUT`: reject malformed input with `400`; call create when ID is absent and owner-scoped update when present; return `404` when update returns `null`; preserve the old key when omitted; honor `clearApiKey`; reject enabling a provider without a saved/new key; encrypt any replacement key before writing.
- [ ] In one transaction, disable the owner's other providers before enabling the selected row; rely on the partial unique index to close concurrent-write races.
- [ ] Map partial-index conflicts to a generic `409` response without returning database details.
- [ ] Implement `DELETE` with both ID and owner filters. Return the same `404` for a missing or unowned ID so the route does not reveal another user's row.
- [ ] Manually verify the five Review Focus cases with two authenticated users and inspect responses to confirm no secret appears.
- [ ] Run `pnpm --filter @smart-idea/web typecheck`.
- [ ] Run `pnpm --filter @smart-idea/web lint`.
- [ ] Commit the repository and route.

### Task 3: Add Settings dialog and provider management UI

**Files:**
- Create: `apps/web/src/_features/settings/index.ts`
- Create: `apps/web/src/_features/settings/ui/settings-dialog.tsx`
- Create: `apps/web/src/_features/settings/ui/ai-provider-settings-panel.tsx`
- Create: `apps/web/src/components/ui/select.tsx`
- Create: `apps/web/src/components/ui/switch.tsx`
- Modify: `apps/web/src/_app/ui/app-sidebar.tsx`
- Modify: `apps/web/src/_features/auth/ui/sidebar-auth.tsx`

**Interfaces:**
- `SettingsDialog({ open, onOpenChange })` contains a left-side **Provider AI** section and a responsive, keyboard-accessible content panel.
- `SidebarAuth({ user, onOpenSettings })` makes the avatar/name/email region an accessible settings button while leaving the sign-out control independent.
- `AiProviderSettingsPanel` consumes only the safe provider API DTO and exposes list/search, add/edit provider, model add/remove/select, enable/disable, and delete actions.

- [ ] Make `AppSidebar` a client boundary with a Settings open state; pass its handler to `SidebarAuth` without moving sign-out into the account button.
- [ ] Build the Settings dialog with the existing `Dialog`, `Button`, `Input`, `Label`, and `Card` components.
- [ ] Add shadcn-style `Select` and `Switch` wrappers using installed `radix-ui` primitives.
- [ ] Build provider rows with active state, type, and selected model; show loading, empty, save-error, and delete states.
- [ ] Build the provider editor with name/type/base URL/API key/model fields. When editing, show only “API key đã cấu hình”; a blank field keeps the old key and an explicit clear control sends `clearApiKey`.
- [ ] Submit mutations before updating local state; show the existing global Sonner toast at the already-configured top-right position only after successful responses.
- [ ] Manually verify account click opens Settings, keyboard focus and Escape work, sign-out still works independently, and CRUD/search/model selection stay in sync with the server.
- [ ] Run `pnpm --filter @smart-idea/web typecheck`.
- [ ] Run `pnpm --filter @smart-idea/web lint`.
- [ ] Run `pnpm build`.
- [ ] Commit the Settings UI and sidebar integration.

### Task 4: Final provider-settings review

**Files:** No additional files.

- [ ] Inspect the generated migration, safe response DTOs, every owner-scoped query, and the credential encryption boundary.
- [ ] Confirm the manual Review Focus checks pass, run `git diff --check`, and report any environment or database prerequisite not available locally.
- [ ] Do not run provider calls or add AI analysis behavior; commit any final correction separately.

---

## Dependencies

Execute this plan before [OpenAI OAuth Provider Implementation Plan](2026-10-11-openai-oauth-provider.md). The OAuth plan adds token storage and the connection flow on top of this provider API and Settings panel.
