# Baseball Scoring App

A local-first Progressive Web App (PWA) for scoring baseball games play-by-play and generating statistics. Built for Dutch baseball clubs using KNBSB scorecards.

**Live app:** [baseball.mourits.nu](https://baseball.mourits.nu)

## Features

- **Play-by-play scoring** — record every at-bat, baserunning event, and fielding credit
- **Scorecard OCR** — photograph a handwritten KNBSB scorecard and import it automatically via GPT-4o Vision
- **Statistics** — batting and pitching stats per player, team, and season
- **Multi-league support** — manage multiple leagues from one account
- **Offline-first** — works without internet, syncs when back online
- **PWA** — installable on iOS, Android, and desktop
- **Dark mode** — system preference respected, manually toggleable
- **Invite-only** — access is controlled via invite links

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS |
| Local storage | Dexie.js v7 (IndexedDB) |
| Backend | Supabase (Postgres, Auth, Edge Functions, RLS) |
| PWA | vite-plugin-pwa |
| Routing | React Router v6 |
| Deployment | Apache + Let's Encrypt, GitHub Actions CI/CD |

## Getting Started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project

### Local Development

1. Clone the repo and install dependencies:

   ```bash
   git clone https://github.com/erikmourits/baseball-scoring.git
   cd baseball-scoring
   npm install
   ```

2. Copy the example env file and fill in your Supabase credentials:

   ```bash
   cp .env.example .env.development
   ```

3. Run database migrations:

   ```bash
   npm run migrate:dev
   ```

4. Start the dev server:

   ```bash
   npm run dev
   ```


### Local Supabase (fully offline)

Run the entire backend locally in Docker — no remote project needed.

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) + [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)

```bash
npm install -g supabase
```

**First-time setup:**
```bash
npm run supabase:start   # prints the local anon key — copy it for the next step
```

Create `.env.localdev` in the project root (never committed):
```dotenv
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<paste key printed by supabase start>
VITE_APP_VERSION=0.0.0-local
SUPABASE_PROJECT_REF=local
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

To test Edge Functions locally, also create `supabase/functions/.env`:
```dotenv
OPENAI_API_KEY=sk-...   # only needed for scorecard OCR
```

**Daily workflow:**
```bash
npm run supabase:start   # start local stack
npm run dev:local        # uses .env.localdev, not .env.development
npm run supabase:reset   # reset DB and re-apply all migrations
npm run serve-functions  # second terminal — serve Edge Functions locally
npm run supabase:stop    # shut down at end of day
```

Supabase Studio is available at [http://127.0.0.1:54323](http://127.0.0.1:54323) while the stack is running.

> To switch back to the remote dev project, delete `.env.localdev` and restart `npm run dev`.

### Environment Variables

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `DATABASE_URL` | Postgres connection string (for migrations) |
| `SUPABASE_PROJECT_REF` | Supabase project reference ID |
| `VITE_SUPABASE_URL` (local) | `http://127.0.0.1:54321` when using local stack |
| `DATABASE_URL` (local) | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

### Database Migrations

```bash
npm run migrate:dev    # Run against development Supabase project
npm run migrate:prod   # Run against production Supabase project
```

### Deploy Edge Functions

```bash
npm run deploy-functions:dev
npm run deploy-functions:prod
```

### Build for Production

```bash
npm run build
```

## Deployment

The app deploys automatically via GitHub Actions on every push to `master`:

1. Runs database migrations
2. Deploys Supabase Edge Functions
3. Builds the frontend
4. Rsyncs `dist/` to the server via SSH

See [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) for the full pipeline.

## Project Structure

```
src/
  components/     Shared UI components
  db/             Dexie schema and local types
  hooks/          useSync, useLeague, useTheme, etc.
  pages/          One file per route
supabase/
  functions/      Edge Functions (site-invite, league-invite, OCR, etc.)
  migrations/     Numbered SQL migration files
  schema.sql      Base schema (idempotent)
apache/           Apache virtual host config
scripts/          Migration and deploy helper scripts
```

## License

[MIT](LICENSE) — Copyright (c) 2026 Erik Mourits
