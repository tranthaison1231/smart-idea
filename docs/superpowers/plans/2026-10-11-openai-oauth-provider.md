# Smart Idea OpenAI OAuth Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add the ChatGPT Subscription/OpenAI OAuth connection to the existing Provider AI settings, including safe token storage, refresh, and disconnect.

**Architecture:** Extend the provider manager with one synthetic OAuth provider per owner and keep OAuth tokens plus one-time authorization transactions in owner-scoped tables. Use OpenAI's documented dynamic SIWC registration, PKCE, database-bound state/nonce, server-side token exchange/refresh, and the credential cipher from the provider-settings plan.

**Tech Stack:** Next.js 16 App Router, TypeScript, Drizzle ORM, PostgreSQL, Node `crypto`, existing Provider AI Settings UI.

**Spec:** [docs/superpowers/specs/2026-10-11-ai-provider-settings-design.md](../specs/2026-10-11-ai-provider-settings-design.md)

## Prerequisite

Complete [Smart Idea Provider AI Settings Implementation Plan](2026-10-11-ai-provider-settings.md) first. This plan consumes its `aiProviders` table, provider repository, safe API DTO, Settings dialog, and `encryptCredential`/`decryptCredential` functions.

## Global Constraints

- Resolve the owner from the authenticated server session on every OAuth route; never accept an owner ID from the browser.
- Encrypt access and refresh tokens with the existing `AI_CREDENTIALS_ENCRYPTION_KEY`; never return or log either token.
- Use PKCE S256 and validate owner-bound OAuth state before exchanging a code. The loopback callback relays a sanitized result to the opener; only the authenticated app session can complete the exchange.
- Keep OAuth connection isolated from API-key CRUD; a failed OAuth upstream request must not block the other providers.
- Before writing Next.js code, read the relevant Next 16 guides in `apps/web/node_modules/next/dist/docs/` as required by `apps/web/AGENTS.md`.
- Do not copy Smart Stock's fixed client ID or private Codex backend endpoint. Use the documented dynamic SIWC registration and public OAuth endpoints. Local app support uses `127.0.0.1:3001`; hosted SaaS access remains gated on OpenAI approval.
- Do not add or run tests unless the user asks; verify with typecheck, lint, build, migration inspection, and the manual checks below.

## Review Focus

- Missing session or malformed callback URL is rejected without storing tokens.
- Missing/mismatched/expired OAuth state is rejected before the token endpoint is called.
- OAuth errors are sanitized in popup HTML and API responses; token values never appear in UI, response, or logs.
- Refresh just before expiry works; if the provider omits a rotated refresh token, retain the previous encrypted refresh token.
- Disconnect deletes only the current user's OAuth credentials and OAuth provider row, leaving their other providers intact.

---

### Task 1: Add owner-scoped OAuth token storage

**Files:**
- Create: `packages/database/src/schema/openai-oauth.ts`
- Modify: `packages/database/src/client.ts`
- Modify: `packages/database/src/index.server.ts`
- Generate: `drizzle/*` migration and snapshot files

**Interfaces:**
- `openaiOAuthAccounts` uses `ownerId` as its primary-key FK to `appUsers.id` (`ON DELETE CASCADE`) and stores issued `clientId`, stable `hostId`, validated `subject`, optional `email`, encrypted access/refresh/ID tokens, granted scopes, expiry, and `updatedAt`.
- `openaiOAuthTransactions` stores a hash of single-use `state`, owner, expected client/subject, encrypted PKCE verifier, nonce, exact callback URI, expiry, and creation time.
- OAuth token persistence and synthetic provider-row updates are added in Task 2 as one transaction.
- The OAuth `aiProviders` row uses `providerType: "oauth"`, no API key, one owner-specific row, and participates in the same one-enabled-provider index as API-key providers.

- [x] Define the OAuth account schema and include it in the Drizzle client schema and server exports.
- [x] Run `pnpm db:generate`.
- [x] Inspect the migration; confirm it only adds the OAuth table and owner constraint and retains the OAuth-provider uniqueness index from the prerequisite plan.
- [x] Run `pnpm db:migrate`.
- [x] Run `pnpm --filter @smart-idea/database typecheck`.
- [x] Run `git diff --check`.
- [ ] Commit the OAuth schema change.

### Task 2: Implement OAuth start, callback, status, and token refresh

**Files:**
- Create: `apps/web/src/_entities/ai-provider/server/openai-oauth.ts`
- Modify: `apps/web/src/_entities/ai-provider/index.server.ts`
- Modify: `apps/web/src/_entities/ai-provider/server/provider-input.ts`
- Modify: `apps/web/src/_entities/ai-provider/server/provider-repository.ts`
- Modify: `apps/web/src/app/api/ai-assistant/providers/route.ts`
- Create: `apps/web/src/app/api/ai-assistant/openai/start/route.ts`
- Create: `apps/web/src/app/api/ai-assistant/openai/callback/route.ts`
- Create: `apps/web/src/app/api/ai-assistant/openai/status/route.ts`
- Create: `apps/web/src/app/api/ai-assistant/openai/logout/route.ts`
- Modify: `.env.example`

**Interfaces:**
- `startOpenAiOAuth(ownerId: string): Promise<{ url: string }>` creates a PKCE verifier, S256 challenge, nonce, random state, stores a short-lived hashed-state transaction, and returns the authorization URL.
- `exchangeOpenAiCode(code: string, verifier: string, clientId: string, redirectUri: string): Promise<OpenAiTokens>` exchanges the authorization code and returns tokens only to server code.
- `openAiOAuthRepository.findForOwner(ownerId: string)` returns the stored token row to server code only.
- `getValidOpenAiAccessToken(ownerId: string): Promise<string | null>` decrypts the owner's token, refreshes within five minutes of expiry, saves encrypted rotated tokens, and preserves the old refresh token if none is returned.
- `OpenAiOAuthTokens` is `{ accessToken: string; refreshToken: string; expiresAt: Date }`. `openAiOAuthRepository.saveForOwner(ownerId: string, tokens: OpenAiOAuthTokens, model: string): Promise<void>` encrypts tokens and transactionally saves them with an enabled OAuth provider row; `deleteForOwner(ownerId: string): Promise<void>` transactionally removes both.
- `POST /start` returns `{ authUrl, callbackOrigin }`. Callback `GET` relays a sanitized code/state payload to the opener. The opener validates the returned state and calls authenticated `POST /complete`, which validates the owner-bound transaction, exchanges the code, validates the issued client ID, granted scope, and ID token, then saves tokens. `GET /status` returns only `{ authenticated: boolean }` and refreshes server-side when the token is within five minutes of expiry; `POST /logout` removes the current user's account/provider row and attempts upstream revocation.
- The provider `PUT` branch for `providerType: "oauth"` accepts only the connected owner's OAuth row ID, model, and enabled state; the standard parser continues to accept API-key provider types. Generic provider `DELETE` rejects OAuth rows and requires the logout route.
- `OPENAI_OAUTH_HOST_ID` is a stable per-installation `urn:uuid:...`; `OPENAI_OAUTH_REDIRECT_URI` defaults to `http://127.0.0.1:3001/api/ai-assistant/openai/callback` for the local app.

- [x] Confirm current official SIWC registration, callback, ID-token, token-refresh, and model-catalog requirements.
- [x] Read the relevant Next 16 route-handler docs.
- [x] Implement PKCE/state using `node:crypto`; bind state to the starting app user in a short-lived DB transaction and consume it exactly once during authenticated completion.
- [x] Implement authorization-code exchange and validate the token response before use.
- [x] Implement encrypted token save/refresh and transactional OAuth provider-row create/delete; preserve the old refresh token if upstream omits a replacement.
- [x] Extend provider input/repository handling so a linked OAuth row can change model or enabled state through the same single-active-provider transaction; reject attempts to create an OAuth row without a linked account.
- [x] Implement `POST /start` and `POST /complete` with session checks and no-store responses.
- [x] Implement callback `GET` with safe HTML; authenticated completion validates owner, state, expiry, and stored callback URI before exchange.
- [x] Implement `GET /status` with owner-scoped refresh and no-store response.
- [x] Implement `POST /logout` to remove only the current user's OAuth records and provider row.
- [x] Verify unauthenticated status/completion requests return 401. A real ChatGPT grant, near-expiry refresh, and upstream revocation were not initiated.
- [x] Run `pnpm --filter @smart-idea/web typecheck`.
- [x] Run `pnpm --filter @smart-idea/web lint`.
- [ ] Commit the OAuth service and routes.

### Task 3: Add the OAuth card and connection flow to Provider AI settings

**Files:**
- Modify: `apps/web/src/_features/settings/ui/ai-provider-settings-panel.tsx`
- Modify: `apps/web/src/_features/settings/index.ts` only if an export changes
- Modify: `.env.example` only if the OAuth redirect setting was not added in Task 2

**Interfaces:**
- The panel shows a ChatGPT Subscription row with connected status, selected model, active-provider switch, and disconnect action; it does not receive tokens.
- The connect action opens the URL returned by `/start`, validates callback origin/source/state, submits the result to authenticated `/complete`, and confirms the owner-scoped connection with `/status`.
- OAuth model choices come from the current account's public `GET /v1/models` catalog and persist only the selected slug in the owner-specific provider row.

- [x] Add the connection/disconnection state to the existing panel; stop waiting when the popup closes, connection succeeds, or the six-minute timeout is reached.
- [x] Show sanitized error/success toasts and never display token data.
- [x] Route OAuth enable/disable through the extended `/api/ai-assistant/providers` handler and same single-active-provider repository rule as API-key providers.
- [ ] Manually verify a real popup grant, selected model persistence, active-provider exclusivity, and remote disconnect; no ChatGPT permission grant was initiated.
- [x] Run `pnpm --filter @smart-idea/web typecheck`.
- [x] Run `pnpm --filter @smart-idea/web lint`.
- [x] Run `pnpm build`.
- [x] Run `git diff --check`.
- [ ] Commit the Settings panel integration.

### Task 4: Final OAuth review

**Files:** No additional files.

- [x] Inspect callback state validation, encrypted token fields, safe response bodies, owner-scoped delete/refresh queries, and OAuth CRUD isolation.
- [x] Inspect the final migration and record that live OAuth sign-in was not verified.
- [ ] Commit any final correction separately; do not add AI analysis or provider-call behavior.
