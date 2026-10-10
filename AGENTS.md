# Smart Idea project guide

## Structure

- This is a pnpm workspace managed with Turborepo. The Next.js app lives in `apps/web`.
- Keep `apps/web/src/app` for Next.js routes, layouts, metadata, and global styles. Route files delegate to page slices.
- Use underscore-prefixed Feature-Sliced layers under `apps/web/src`: `_app`, `_pages`, `_widgets`, `_features`, `_entities`, and `_shared`.
- Add a layer or package only when real code needs it. Do not create placeholder database, API, feature, or entity modules before their responsibilities are known.
- Keep dependencies flowing downward: app and pages may compose lower layers; shared code must not import from the app, page, widget, feature, or entity layers.
- Expose a slice through its `index.ts` when another slice or the route layer imports it. Keep same-slice implementation details private.

## Changes

- Preserve the Vietnamese-first interface and the dark navy/coral visual tokens in `apps/web/src/app/globals.css`.
- Prefer server components. Add client boundaries only for interactions that need browser state.
- Keep the workspace dependency list small until a concrete feature needs more.
