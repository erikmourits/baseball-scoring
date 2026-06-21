# Baseball Scoring App — Architecture Plan

## Overview

A local-first Progressive Web App (PWA) for scoring baseball games play-by-play and from photo uploads of written scorecards, with statistics generation and optional cloud sync across devices.

---

## Tech Stack

### Frontend
| Layer | Choice | Why |
|---|---|---|
| Framework | **React + TypeScript + Vite** | Fast dev, excellent PWA plugin, strong ecosystem |
| PWA | **vite-plugin-pwa** | Service worker generation, offline caching, install prompts |
| Local DB | **Dexie.js v7** (IndexedDB wrapper) | Reliable offline storage, sync-friendly, works in all browsers |
| UI | **Tailwind CSS** | Mobile-first utilities, responsive by default |
| Routing | **React Router v6** | Standard, well-supported |
| OCR | **GPT-4o-mini Vision** (via Supabase Edge Function) | Best accuracy for handwritten KNBSB scorecards; ~€0.01–0.02 per image |

### Backend / Cloud
| Layer | Choice | Why |
|---|---|---|
| Platform | **Supabase** | Auth, PostgreSQL, RLS, Edge Functions — free tier sufficient |

### Deployment
- **Frontend**: `baseball.mourits.nu` — self-hosted Linux server, served by **Nginx**
- **SSL**: Let's Encrypt via **Certbot**
- **CI/CD**: **GitHub Actions** — on push to `main`, builds and rsync's `dist/` to server

---

## Data Model

```
League
  id, name, created_by
  created_at, updated_at

LeagueMember
  id, league_id, user_id, role (owner | scorer), email
  joined_at

LeagueInvite
  id (token), league_id, email, role, invited_by
  expires_at, accepted_at

Season
  id, user_id, league_id
  name, year, start_date, end_date, is_active
  created_at, updated_at

Team
  id, user_id, league_id
  name, home_field
  created_at, updated_at

Player
  id, team_id
  name, jersey_number
  primary_position, secondary_positions[]
  deleted_at        ← soft delete
  created_at, updated_at

Game
  id, user_id, league_id, season_id
  date, location
  home_team_id, away_team_id
  home_score, away_score
  innings_complete, status (draft | in_progress | final)
  created_at, updated_at

Inning
  id, game_id, inning_number, half (top | bottom)

AtBat
  id, inning_id
  batter_id, pitcher_id
  result, rbi_count
  fielding_credits[], baserunning_events[]

FieldingCredit
  at_bat_id, player_id, credit_type (putout | assist | error), sequence_number

BaserunningEvent
  at_bat_id, runner_id
  event_type (SB | CS | WP | PB | balk | pickoff | scored | stranded)

PitchingLine
  id, game_id, player_id
  outs_recorded, hits_allowed, runs_allowed, earned_runs
  walks, strikeouts, hbp
  is_winning_pitcher, is_losing_pitcher, is_save

GameShare
  id (token), game_id, created_by  ← public watch link
```

All local records use a client-generated UUID and carry a `_dirty` flag for sync.

### Dexie version history
| Version | Change |
|---|---|
| v1 | teams, players |
| v2 | games, innings, atBats, fieldingCredits, baserunningEvents, pitchingLines |
| v3 | forced upgrade past stale browser state |
| v4 | dropped `lineupOrder` index; `secondaryPositions` as plain array |
| v5 | added `seasons`; `seasonId` index on games |
| v6 | added `gameShares`, `gameLineups` |
| v7 | added `leagues`; `leagueId` index on teams, seasons, games |

> **Never downgrade the Dexie version number.**

### Dexie migration convention

Every Dexie version bump must include an `upgrade()` handler alongside the schema change. The handler's job is to leave local IndexedDB in a consistent state so that the pull-then-sync chain succeeds on first open after update.

**Rules:**
1. **Always mark affected records `_dirty: true`** in the upgrade handler. This guarantees they are re-pushed to Supabase with the correct new shape, even if they were previously synced.
2. **Populate defaults locally where possible.** If the new field can be derived from existing local data (e.g. a computed flag, a renamed field), do it in the upgrade handler so sync sends correct data immediately.
3. **Never call Supabase from the upgrade handler.** The DB is not open yet and there is no auth session. For fields that require server data (e.g. a foreign key like `leagueId`), mark records dirty and rely on `pullFromServer()` → `stampMissingLeagueIds()` (or equivalent) to fill the value before sync runs.
4. **Pair every Dexie bump with a Supabase migration.** The two must be released together. The Supabase migration adds/alters the column; the Dexie upgrade transforms local data.

**Template:**
```ts
.version(N)
.stores({
  // full schema as always — Dexie requires the complete store definition each version
  teams: 'id, userId, leagueId, newField',
  // ...other stores unchanged...
})
.upgrade(async tx => {
  // 1. Transform local data where the value is computable
  await tx.table('teams').toCollection().modify(team => {
    team.newField = deriveDefault(team)   // compute from existing local data
    team._dirty = true                   // always mark dirty
  })

  // 2. For fields requiring server data, just mark dirty — pullFromServer
  //    will fetch the authoritative value and stampMissing* will fill it in
  await tx.table('seasons').toCollection().modify(season => {
    season._dirty = true
  })
})
```

**Ordering guarantee on app open after update:**
```
Dexie upgrade handler (sync, before app mounts)
  → app mounts, user authenticated
  → pullFromServer()
      → pull leagues (or whatever the dependency is)
      → stampMissing*() fills server-dependent fields on dirty records
  → syncAll() pushes dirty records with correct shape
```

**What v7 should have had (not retroactively fixed, documented for reference):**
```ts
.version(7).stores({ leagues: 'id, createdBy', teams: '...leagueId', ... })
.upgrade(async tx => {
  // Couldn't populate leagueId (requires Supabase), but should have marked dirty
  // so stampMissingLeagueIds() in pullFromServer() would handle it reliably
  await tx.table('teams').toCollection().modify(t => { t._dirty = true })
  await tx.table('seasons').toCollection().modify(s => { s._dirty = true })
  await tx.table('games').toCollection().modify(g => { g._dirty = true })
})
```

---

## Feature Breakdown

### League Architecture
- League is the top-level data container — teams, seasons, and games all live inside one
- Users can create multiple leagues and switch between them (active league stored in localStorage)
- Owners invite scorers via a unique token link (`/league-invite/:token`)
- All Supabase RLS checks league membership via `is_league_member(league_id)` (security definer function)

### Team & Roster Management
- Create / rename / delete teams (scoped to active league)
- Add / edit players with jersey number, primary + secondary positions
- Soft-delete players (`deletedAt`) — preserves game history; reactivate from inactive list

### Seasons
- Seasons group games and stats; one season is "active" at a time
- Create, set active, delete; synced to Supabase

### Play-by-Play Scoring
- New game wizard: season, teams, date, location, lineup order, starting pitchers
- Scoring UI: scoreboard, base diamond, batter card with previous at-bat chips
- Result buttons: 1B, 2B, 3B, HR, BB, HBP, RoE, FC, K, SAC, SF, GDP, FO
- Between-at-bat events: SB, CS, WP, PB, BALK
- Pitcher tracking with mid-inning substitution
- Unlimited undo (persisted to localStorage); skip half-inning; end game
- Sync + real-time: live game view for spectators via share link (`/watch/:token`)

### Image Upload & OCR
- Upload or photograph a KNBSB scorecard
- Supabase Edge Function sends image to GPT-4o-mini Vision, returns structured JSON
- Review screen: confidence indicators, editable per-inning results, saves to Dexie

### Statistics
- Computed on-the-fly from game log (no separate stats table)
- Batting: AVG, OBP, SLG, OPS, G, AB, PA, H, 1B–HR, R, RBI, BB, K, HBP, SAC, SF, RoE
- Pitching: IP, H, R, ER, BB, K, HBP, W, L, SV, ERA, WHIP
- Fielding: PO, A, E, FLD% (planned)
- Export: Excel (.xlsx) season stats, printable box score (browser → PDF)

### Sync
- All writes go local first (`_dirty: true`), then upserted to Supabase
- Pull on login; auto-push on dirty record accumulation (debounced 2s)
- Pull functions prune local records deleted from server
- Offline banner shown; sync error shown with retry; otherwise silent
- Danger zone: "Re-sync all local data to server" and "Clear local data & reload from server"

---

## Build Phases

### Phase 0 — Project Setup ✅
- [x] Scaffold Vite + React + TypeScript + Tailwind
- [x] Configure vite-plugin-pwa
- [x] Configure Dexie.js schema (now v7)
- [x] Supabase project: auth, database, RLS, migrations runner (`npm run migrate`)
- [x] Auth screens: sign up, log in, log out

### Phase 1 — Teams, Roster & Seasons ✅
- [x] Team CRUD; player add/edit with positions chip UI; soft delete + reactivate
- [x] Season model: create, set active, delete; games linked to season
- [x] Local-first storage + sync to Supabase
- [x] Custom `ConfirmDialog` component

### Phase 2 — Play-by-Play Scoring ✅
- [x] New game wizard (season, teams, date, location, lineup order, starting pitchers)
- [x] Scoring UI: batter card, result buttons, fielder selection (1–9 grid)
- [x] Baserunner state, runner outcomes, between-at-bat events
- [x] Pitcher tracking + mid-inning substitution
- [x] Unlimited undo (localStorage); skip half-inning; end game
- [x] Game list on home screen by season; delete game
- [x] Game summary: linescore + batting + pitching lines per team

### Phase 3 — Image Upload & OCR ⏳ (blocked on OpenAI credits)
- [x] Supabase Edge Function: image → GPT-4o-mini Vision → JSON game log
- [x] Camera / file upload UI; review & correction screen
- [x] Routes wired; 📷 button on HomePage
- [ ] End-to-end test with real scorecard (add credits at platform.openai.com/settings/billing)

### Phase 4 — Statistics & Export (partial ✅)
- [x] Batting stats: AVG, OBP, SLG, OPS, full counting stats
- [x] Pitching stats: IP, ERA, W/L, K, BB, WHIP
- [x] Box score / game summary page
- [x] Season stats view (TeamDetailPage, PlayerStatsPage with game log)
- [ ] Excel (.xlsx) export for season batting + pitching stats
- [ ] Print-optimised box score layout
- [ ] Fielding stats (PO, A, E, FLD%)

### Phase 5 — Sync & Multi-Device ✅ 
- [x] Dirty-flag push + pull for all tables (leagues, teams, players, seasons, games, innings, at-bats)
- [x] Pull functions prune server-deleted records
- [x] Online/offline detection; silent sync banner (error + offline only)
- [x] Share links → public live game view (`/watch/:token`)
- [x] Danger zone: force-resync and clear-local-and-resync

### Phase 6 — League Architecture ✅
- [x] `leagues`, `league_members`, `league_invites` tables with full RLS
- [x] `league_id` denormalized on teams, seasons, games; all queries scoped to active league
- [x] Multi-league support: create multiple, switch between them, active stored in localStorage
- [x] LeagueSettingsPage: switcher, create, rename, member list, invite scorers, danger zone
- [x] League invite flow: token link → Edge Function → member upsert
- [x] BottomNav: 5 tabs (Games, Teams, Seasons, Stats, League)
- [x] Migrations 012–017: full RLS rewrite, team_members removal, policy cleanup
- [ ] Run `npm run migrate` on production
- [ ] Run `npm run deploy-functions` (league-invite Edge Function)

### Phase 7 — Remaining Features ❌

#### 7.1 — Invite-only signup ✅
Right now anyone with the URL can create an account. The app runs on a free Supabase tier with a paid OpenAI key, so we need to control who can sign up.

**Approach:** the signup gate lives entirely in Supabase Auth — not in client code. Toggle **"Enable email signups"** off in the Supabase dashboard (Auth → Settings → Email). When disabled, `supabase.auth.signUp()` returns a `"Signups not allowed"` error server-side regardless of what the client sends, so it cannot be bypassed. To re-enable open signups, flip the toggle back on in the dashboard — no code deploy needed. The `SignupForm` component is kept intact; it just handles the error gracefully.

**Implementation:**

1. **Supabase Auth toggle** — in the Supabase dashboard: Auth → Settings → Email → disable "Enable email signups". This is the single source of truth. To open signups again, re-enable it. No migration or code change required.

2. **`SignupForm` error handling** — when signups are disabled, Supabase returns an error with message `"Signups not allowed"`. Update `SignupForm` to detect this specific error and show a friendly message: *"Sign-ups are currently invite-only. Contact the admin to request access."* All other error messages surface as-is. The form and tab remain visible and functional for when signups are re-enabled.

3. **`is_site_admin()` helper** — a Postgres security-definer function used by RLS policies and Edge Functions to identify the admin:
   ```sql
   create table site_admins (user_id uuid primary key references auth.users);
   -- Insert after first login: insert into site_admins values ('<your-user-id>');
   create function is_site_admin() returns boolean
     language sql security definer
     as $$ select exists (select 1 from site_admins where user_id = auth.uid()) $$;
   ```

4. **`site_invites` table** — the admin enters a name/label (e.g. "Jan de Vries"); the invitee chooses their own email when following the link. Uses `name text not null` instead of `email`, so there is no email pre-assignment:
   ```sql
   create table site_invites (
     token       uuid primary key default gen_random_uuid(),
     name        text not null,
     created_by  uuid references auth.users,
     created_at  timestamptz default now(),
     accepted_at timestamptz,
     expires_at  timestamptz default now() + interval '7 days'
   );
   alter table site_invites enable row level security;
   create policy "admin insert" on site_invites for insert using (is_site_admin());
   create policy "public token read" on site_invites for select using (true);
   ```
   *(Migration 020 renamed the original `email` column to `name`.)*

5. **`site-invite` Edge Function** — three modes:
   - `GET ?token=` — public; validates token and returns `{ name, expires_at }`
   - `POST` (no token, admin auth) — creates an invite row, returns `{ token }`
   - `POST ?token=` — public; accepts `{ email, password }` from the body and calls `admin.createUser({ email, password, email_confirm: true })`, then marks `accepted_at = now()`. Using `createUser` (rather than `inviteUserByEmail`) lets the invitee set their own password immediately without a separate magic-link step.

6. **`/signup/:token` route** — `SignupInvitePage` validates the token (GET), shows the invite name, collects email + password, calls POST `?token=` to create the account, then signs the user in automatically and navigates to `/`.

7. **Admin UI** — add a `/admin` route, visible only to site admins (`is_site_admin()` check on load):
   - **Invite form:** email input → calls `site-invite` Edge Function → copies invite link to clipboard
   - **Invite table:** all invites with status (pending / accepted / expired) and a revoke button
   - **User list:** all auth users via `admin-users` Edge Function (service role); email, created date, delete button
   - **Note on the signup toggle:** controlled from the Supabase dashboard, not from this UI. The admin UI intentionally has no toggle here — keeping the gate server-side means it cannot be circumvented by a client-side workaround.

**Files to create/change:**
- `supabase/migrations/019_site_invites.sql` — `site_admins` table + `is_site_admin()`, `site_invites` table + RLS
- `supabase/functions/site-invite/index.ts` — validate token, call `admin.inviteUserByEmail`, mark accepted
- `supabase/functions/admin-users/index.ts` — list + delete auth users (service role)
- `src/components/auth/SignupForm.tsx` — handle `"Signups not allowed"` error with friendly message; no other changes
- `src/pages/AdminPage.tsx` — invite form, invite table, user list
- `src/App.tsx` — add `/admin` and `/signup/:token` routes

---

#### 7.2 — Development Supabase environment ✅
Dev project: `hfdyalavnpnqmpmxtdzg` (baseball-dev). Prod project: `eqnumwovwvubfmkprglg`.

- `.env.development` / `.env.production` — both gitignored; hold URL, anon key, project ref, DB URL per env
- `npm run dev` → dev project; `npm run build` / CI → prod project
- `scripts/migrate.js` runs `schema.sql` first, then numbered migrations; accepts `--env dev/prod`
- `scripts/deploy-functions.js` reads `SUPABASE_PROJECT_REF` from env file and runs `supabase link` before deploying
- New `package.json` scripts: `migrate:dev`, `migrate:prod`, `deploy-functions:dev`, `deploy-functions:prod`

---

#### 7.3 — Check if client is latest version ✅
Implemented. See `src/services/sync.ts` (`ClientOutdatedError`, `semverLt`, `checkClientVersion`), `src/hooks/useSync.ts` (`outdated` state), `src/components/layout/AppShell.tsx` (blocking `OutdatedBanner` + SW update prompt). Migration `018_app_config.sql` creates the `app_config` table.

To block an outdated client: bump `minimum_client_version` in the `app_config` table.

---

#### 7.4 — Dark mode ✅
The app uses Tailwind CSS. Tailwind's `dark:` variant is the natural fit — it reads a `dark` class on `<html>` and the user's `prefers-color-scheme` media query.

**Implementation:**
- Enable `darkMode: 'class'` in `tailwind.config.js`
- Add a `useTheme` hook that:
  1. Reads initial preference from `localStorage` (or falls back to `window.matchMedia('prefers-color-scheme: dark')`)
  2. Toggles the `dark` class on `document.documentElement`
  3. Persists preference to `localStorage`
- Add a theme toggle button to `LeagueSettingsPage` (or the bottom of every page via `AppShell`)
- Audit all existing Tailwind classes and pair them with `dark:` equivalents:
  - `bg-gray-50` → `dark:bg-gray-900`
  - `bg-white` → `dark:bg-gray-800`
  - `text-gray-900` → `dark:text-gray-100`
  - `text-gray-500` → `dark:text-gray-400`
  - `border-gray-200` → `dark:border-gray-700`
  - `shadow-sm` shadows may need `dark:shadow-gray-900`
- Update `AppShell` background and `BottomNav` to respect dark tokens
- Test on iOS Safari (dark mode from system settings) and Chrome

**Files to create/change:**
- `tailwind.config.js` — add `darkMode: 'class'`
- `src/hooks/useTheme.ts` — new hook
- `src/components/layout/AppShell.tsx` — apply `dark:` to shell bg
- `src/components/layout/BottomNav.tsx` — dark variants
- All page files — audit and add `dark:` classes
- `src/pages/LeagueSettingsPage.tsx` — add theme toggle UI

---

#### 7.5 — Import schedule (nice to have) ❌
Allow importing a season game schedule from a CSV or copy-paste, creating games in bulk rather than one by one.

**Approach:** accept a simple CSV format, parse client-side, create `LocalGame` records in Dexie with `status: 'draft'` and let the normal sync push them to Supabase.

**Expected CSV format:**
```
date,home_team,away_team,location
2026-04-05,Rotterdam Neptunus,Hoofddorp Pioniers,Neptunus Veld
2026-04-12,DSS,HCAW,Pim Mulier Stadion
```

**Implementation:**
- Add an "Import schedule" button to `SeasonsPage` (or a new `ScheduleImportPage`)
- Parse CSV client-side with PapaParse (already a listed available library)
- Match team name strings to existing `LocalTeam` records by name (case-insensitive); warn on unmatched names
- Show a preview table: date, home, away, location, status (matched ✅ / unmatched ❌)
- On confirm: bulk-insert `LocalGame` records via `gameService.create()` (or direct Dexie add with `_dirty: true`)
- Sync runs automatically after insert

**Files to create/change:**
- `src/pages/ScheduleImportPage.tsx` — upload/paste + preview + confirm
- `src/App.tsx` — add `/seasons/:id/import` route
- `src/pages/SeasonsPage.tsx` — add "Import schedule" link

---

- [x] leagueId should not be nullable (held over from before League existed)

### Phase 8 — Quality & Testing (partial ✅)
- [x] **Unit tests** (Vitest — 169 tests passing)
  - `src/__tests__/baseballLogic.test.ts` — 88 tests: result classification, out counting, scoring, baserunner logic
  - `src/__tests__/statsCalc.test.ts` — 81 tests: `computeBattingLine`, `computePitchingLine`, `getPitcherDecisions`, formatting helpers; edge cases for ROE/FC (AB but no hit, no OBP), GDP (2 outs), fmtEra(0,0) = em dash
- [x] **E2E tests** (Playwright — 22 tests passing, 1 skipped)
  - `e2e/auth.spec.ts` — sign-out redirects to /auth; authenticated user sees home
  - `e2e/navigation.spec.ts` — all 5 bottom-nav tabs; unknown route redirects home
  - `e2e/teams.spec.ts` — page load; create team (waits for Supabase pull); navigate to detail
  - `e2e/seasons.spec.ts` — page load; create season (waits for Supabase pull)
  - `e2e/league.spec.ts` — page load; dark mode toggle; language toggle
  - `e2e/game-flow.spec.ts` — home, /games/new wizard, stats page, help page
  - Auth state shared via `e2e/.auth/user.json`; credentials in gitignored `.env.e2e`
- [ ] **Code review pass**
  - Add React error boundaries (none exist)
  - Audit missing loading/empty states across all pages
  - Accessibility: labels, focus management, tap target sizes
  - Performance: large useLiveQuery queries, unnecessary re-renders
  - Security: RLS policy audit, Edge Function input validation
  - Dead code and unused imports cleanup
- [ ] **Dexie migration convention audit** — verify all future version bumps include an `upgrade()` handler per the convention documented above

### Phase 9 — Deployment & Polish ✅
- [x] DNS A record: `baseball.mourits.nu` → server IP
- [x] Apache virtual host config (`apache/baseball.mourits.nu.conf`)
- [x] Certbot SSL (`sudo certbot --apache -d baseball.mourits.nu`)
- [x] GitHub Actions CI/CD pipeline (migrate → deploy Edge Functions → build → rsync)
- [x] GitHub release-based deploys (production triggered by GitHub Release, not every push)
- [x] README.md + MIT license
- [ ] PWA install prompt (iOS and Android)

### Phase 10 — Release Management & Onboarding ❌

#### 10.1 — GitHub release workflow ✅
- [x] Updated `.github/workflows/deploy.yml` — triggers on GitHub Release published + manual dispatch
- [x] Added `.github/workflows/deploy-dev.yml` — triggers on push to `dev` branch, targets `development` environment

#### 10.2 — Help page ✅
A `/help` route covering: getting started, scoring conventions, OCR upload, stats, sync, and inviting scorers. Accessible from League Settings → Help → "How to use this app".

#### 10.3 — First-time user introduction ✅
Fullscreen onboarding wizard shown when `league === null`. Pulls from server first to handle invited scorers (who already have a league on the server). Two steps: welcome screen → create league. Accessible again via League Settings → Help → "Show introduction".

#### 10.4 — Dev environment setup ❌ (server-side, manual)
- [ ] Create Apache vhost for `baseball-dev.mourits.nu` (same config as production, root: `/export/www/baseball-dev.mourits.nu`)
- [ ] Run Certbot for `baseball-dev.mourits.nu`
- [ ] Create `development` environment in GitHub (Settings → Environments) with its own secrets/variables pointing to the dev Supabase project
- [ ] Create a `dev` branch — pushes to it auto-deploy to `baseball-dev.mourits.nu`

---

### Phase 11 — Internationalisation (i18n) ✅
Make the app available in English and Dutch. Dutch should be the default for this app.

#### Approach
Use **react-i18next** (industry standard, works well with Vite). Language stored in `localStorage`, auto-detected from browser locale on first visit.

#### Implementation steps
- [x] Install `react-i18next` and `i18next-browser-languagedetector`
- [x] Create translation files: `src/locales/en/translation.json` and `src/locales/nl/translation.json`
- [x] Wrap app with `I18nextProvider`, configure auto-detection (browser locale → localStorage fallback)
- [x] Replace all hardcoded UI strings with `t('key')` calls across all pages and components
- [x] Add language toggle to League Settings (next to dark mode toggle)
- [x] Translate the Dutch file (`nl/translation.json`) — all strings from the English base
- [x] Update `HelpPage.tsx` content for both languages
- [x] Update `OnboardingWizard.tsx` content for both languages

#### Key files to touch
All pages in `src/pages/`, shared components in `src/components/`, bottom nav labels, error messages, confirm dialogs.

#### Notes
- Baseball terminology in Dutch: at-bat = slagbeurt, inning = inning, pitcher = werper, batter = slager, out = uit, safe = veilig, home run = homerun, walk = vier ballen (BB), strikeout = uitgeslagen (K)
- Keep baseball abbreviations (1B, 2B, HR, BB, K, etc.) in English — they are universal in Dutch baseball

---

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Single codebase | PWA (not React Native) | Fastest path; no app store friction; offline-capable |
| Auth | Supabase Auth (email + password) | Simple, built-in |
| OCR | GPT-4o-mini Vision (server-side Edge Function) | API key never in client; ~€2/year at hobby scale |
| Offline storage | Dexie.js (IndexedDB) | Persistent; works in all modern browsers incl. Safari |
| Conflict resolution | Last-write-wins by `updated_at` | Sufficient for hobby use; simpler than CRDT |
| Stats storage | Computed on-the-fly from game log | No stale stats; game log is source of truth |
| Multi-tenancy | League as top-level container | Enables multiple leagues per user and scorer invites |
| RLS | security definer helper functions | Avoids bootstrap problem; inline subqueries can't bypass RLS |
| League switching | localStorage + StorageEvent | Simple; reactive
