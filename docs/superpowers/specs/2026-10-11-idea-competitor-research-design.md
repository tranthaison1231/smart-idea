# Smart Idea: AI Research for Idea Competitors

## Goal

Let a user research evidence-backed competitors for one of their saved Ideas, review the results, and explicitly replace that Idea's saved competitor list when they choose **Lưu**.

## MVP scope

- Add a one-to-many competitor list to each Idea and render it in the Idea detail **Đối Thủ** tab.
- Use the platform's Tavily search configuration for public web evidence and the current user's enabled AI provider to synthesize up to five competitors.
- Keep generated results as an unsaved client-side draft. Searching or refreshing does not write competitor rows to the database.
- Show **Tìm kiếm đối thủ** when there is no draft. After research, show the draft with **Làm mới** and **Lưu** actions.
- **Làm mới** replaces only the current draft after a successful new search. A failed search leaves both the current draft and saved rows untouched.
- **Lưu** replaces all saved competitors for this Idea with the validated draft in one database transaction. If the Idea already has saved competitors, explain that replacement in a confirmation dialog before committing.
- Show a success toast after the save transaction succeeds. On failure, retain the draft and saved rows.

## Competitor data

Add an `idea_competitors` table with one row per company/product and a foreign key to `ideas.id` that cascades on Idea deletion. Ownership is enforced through the parent Idea; the competitor row does not duplicate `user_id`.

Each row contains:

- `id` (UUID primary key) and `idea_id` (UUID foreign key).
- `company_name` (required) and `product_name` (nullable).
- `website` (nullable HTTPS URL, only when supported by a search result).
- `overview` (required positioning/description) and `target_customer` (nullable).
- `key_features`, `strengths`, and `weaknesses` as non-null text arrays, empty when evidence is unavailable.
- `pricing` (nullable; do not infer a price without evidence).
- `sources` as a non-empty JSONB array using the existing `MarketSourceRecord` shape: `id`, `title`, `url`, `domain`, `snippet`, and nullable `publishedAt`.
- `created_at` with a database default.

Add an index on `idea_id`. The server validates the candidate count, field sizes, array sizes, and every source URL before persistence. Each competitor must have at least one source; AI output that cannot be tied to returned Tavily sources is discarded.

## Research flow

1. The owner-scoped Idea detail page loads saved competitors on the server and passes them to the interactive competitor section.
2. The user starts research. The server checks authentication, Idea ownership, Tavily configuration, and the user's enabled AI provider before starting external work.
3. A bounded set of Tavily queries is derived from the Idea's name, industry, problem, target customer, and solution. Reuse the existing Tavily integration and normalized `MarketSourceRecord` shape; cap the result set at 20 sources. Do not fetch arbitrary URLs from the browser or scrape source pages directly.
4. The enabled provider structures the evidence into at most five distinct competitors. Every candidate must cite one or more returned source IDs. Unsupported pricing, features, strengths, or weaknesses remain empty/unknown. The model is instructed to treat source content as untrusted data and ignore instructions embedded in it.
5. Return the validated draft with a short-lived integrity proof bound to the authenticated user, Idea, and normalized draft content. The proof uses a purpose-specific HMAC derived from the existing `BETTER_AUTH_SECRET`; no draft row is written to the database.
6. Display candidates in a clearly labeled **Kết quả chưa lưu** table. Keep the current saved table visible until a successful save. Long descriptions and feature/strength/weakness lists can be expanded from a row; source links open in a new tab.
7. Refresh replaces the draft only when the new research response is valid. Save submits the draft and proof, verifies that the proof is current and matches the exact draft, validates the fields again, then transactionally deletes the old rows and inserts the new rows. The old list is not deleted if validation or insertion fails.
8. After a successful save, clear the draft, refresh the server-rendered saved list, and show a success toast.

The saved table summarizes company/product, overview, target customer, pricing, and evidence links. Feature, strengths, and weaknesses details remain accessible without forcing every long field into a wide table. On narrow screens the table can scroll horizontally.

## API and authorization

- `POST /api/ideas/:id/competitors/research` accepts no owner ID or free-form search prompt. It returns a validated draft and short-lived integrity proof; it does not persist competitor records.
- `PUT /api/ideas/:id/competitors` accepts the full draft list and its proof, verifies that the proof binds the exact research output to the current owner and Idea, then replaces the saved list atomically.
- No separate read endpoint is needed for the MVP; the server-rendered Idea detail page loads rows through an owner-scoped repository query.
- Both routes require `requireCurrentAppUser()` and verify ownership of the Idea on the server. IDs and owner identity come from the route/session, never from trusted client fields.
- Responses use `Cache-Control: no-store`. Provider credentials and Tavily keys stay server-side and must not appear in response bodies or logs.
- Request bodies are bounded and validated. Persisted evidence URLs must be HTTPS, contain no embedded credentials, and correspond to sources returned by research.

## Failure behavior

- Missing Tavily configuration and missing/disabled provider have separate, actionable UI messages; neither case starts partial work.
- Provider timeout, Tavily failure, invalid model output, or empty evidence returns a safe retryable error. Existing saved data and the current draft remain unchanged.
- A refresh already in progress disables duplicate actions and shows loading feedback. Save also shows a pending state and cannot be submitted twice concurrently from the UI.
- The replace transaction is the only operation that changes saved competitors. A failed transaction rolls back to the previous list.

## Out of scope

- Manual add/edit/delete of individual competitors.
- Research history or restoring an earlier saved list; each successful save replaces the prior list.
- Scheduled or background research, per-user search-source configuration, deep site crawling, and paid data sources.
- Competitor scoring, financial forecasts, market sizing, or claims without linked public evidence.

## Acceptance criteria

1. A user can search from an owned Idea's **Đối Thủ** tab and see up to five sourced draft competitors without creating database rows.
2. Refresh replaces the draft only after a successful response; failures preserve the old draft and saved rows.
3. Saving a draft replaces the saved competitor list atomically; reloading the Idea shows the new list and its evidence.
4. A different user cannot read, research, or replace competitors for an Idea they do not own.
5. Invalid or unsupported AI claims are rejected or left unknown; every persisted competitor has at least one HTTPS source returned by the research operation, and the draft proof prevents changing that evidence between research and save.
6. Missing provider or Tavily configuration is explained without exposing credentials or losing saved data.

## Material limitation

Public search coverage and model synthesis can miss competitors or misread evidence. The interface must expose source links and present results as research leads for the user to review, not verified market facts.
