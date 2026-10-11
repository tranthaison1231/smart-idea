# Smart Idea

Smart Idea is a product workspace built with a pnpm monorepo, Turborepo, Next.js, and feature-sliced boundaries. It uses Better Auth with Google OAuth and PostgreSQL through Drizzle.

## Start locally

Requirements: Node.js 20.9+ and pnpm 10.32.1.

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Open [http://localhost:3001](http://localhost:3001).

## Google sign-in

Fill `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` in `.env`. Generate `BETTER_AUTH_SECRET` with `openssl rand -base64 32`. Register `${BETTER_AUTH_URL}/api/auth/callback/google` as an authorized redirect URI for the Google OAuth client. For local development, `BETTER_AUTH_URL` is `http://localhost:3001`.

Create the authentication and application-user tables with:

```bash
pnpm db:generate
pnpm db:migrate
```

Google sign-in stays disabled until all required values are configured. The initial auth schema includes Better Auth's user/session/account tables and a separate `app_users` table linked to Google identities; future ideas can reference `app_users.id` as their owner.

## Khám phá cơ hội sản phẩm

Set `TAVILY_API_KEY` in `.env` to enable web evidence search. Apply the current Drizzle migration with `pnpm db:migrate`; users also need an enabled AI provider in Settings. Tavily source snapshots are shared for the daily Vietnam feed, while AI summaries and history are scoped to the signed-in user. Confirm the [Tavily Platform Terms](https://www.tavily.com/terms) permit the platform-key/end-user use case before enabling this feature for external users.

## Access control

Workspace pages belong under `apps/web/src/app/(workspace)` and require a valid server-side session; unauthenticated users are redirected to `/login`. Keep login and Better Auth callback routes public. Future business API handlers must resolve the current app user on the server and scope data by `app_users.id`; never authorize using a user ID supplied by the client. The current starter has per-user ownership and no role matrix.

## Workspace

```text
apps/
└── web/                       # Next.js App Router application
    └── src/
        ├── app/                # Routes, root layout, global styles
        ├── _app/               # App shell and navigation
        ├── _pages/             # Route-level page compositions
        ├── _widgets/           # Larger reusable UI compositions
        ├── _features/          # Authentication and user actions
        ├── _entities/          # Application-user domain
        └── _shared/            # Brand and cross-cutting UI
packages/
└── database/                  # PostgreSQL schema and server client
```

Keep `app/` files thin, and add domain modules where their responsibilities become clear.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Run the web app in development |
| `pnpm build` | Build the web app |
| `pnpm start` | Serve a production build |
| `pnpm lint` | Lint workspace packages |
| `pnpm typecheck` | Typecheck workspace packages |
| `pnpm db:generate` | Generate PostgreSQL migrations from the Drizzle schema |
| `pnpm db:migrate` | Apply migrations to the configured `DATABASE_URL` |

## Visual direction

The starter uses a left-sidebar workspace layout with a deep navy background, coral accent, and quiet borders, drawing visual cues from [Kynovex](https://kynovex.pages.dev/). It does not reuse Kynovex assets or branding.
