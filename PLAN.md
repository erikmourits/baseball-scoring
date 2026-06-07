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

### Phase 6a - User admin + Soft open (invite only) ❌
- [ ] Only people with an invite can create a user and join the app (At the moment we are using free tier cloud and payed AI. We don't want to run into rate limits)
  - Site admin can create invite link
  - Site admin can view created users and manage (delete) them

### Phase 7 — Quality & Testing ❌
- [ ] **Extend unit tests** (Vitest — currently 88 tests on baseballLogic.ts)
  - statsCalc.ts: batting/pitching calculation edge cases
  - sync.ts: dirty flag, pull-prune, leagueId fallback logic
  - teamService / seasonService / gameService
- [ ] **E2E tests** (Playwright — not yet installed)
  - Auth: sign in, sign out
  - Full game flow: create league → season → team → score game → view summary
  - League switching: verify data isolation between leagues
  - Invite flow: generate link → accept → member appears
  - Offline → back online → sync resolves correctly
- [ ] **Code review pass**
  - Add React error boundaries (none exist)
  - Audit missing loading/empty states across all pages
  - Accessibility: labels, focus management, tap target sizes
  - Performance: large useLiveQuery queries, unnecessary re-renders
  - Security: RLS policy audit, Edge Function input validation
  - Dead code and unused imports cleanup

### Phase 8 — Deployment & Polish ❌
- [ ] DNS A record: `baseball.mourits.nu` → server IP
- [ ] Install Nginx; configure virtual host
- [ ] Certbot SSL (`sudo certbot --nginx -d baseball.mourits.nu`)
- [ ] GitHub Actions secrets + push-to-deploy pipeline
- [ ] PWA install prompt (iOS and Android)
- [ ] End-to-end mobile testing (Safari iOS, Chrome Android)

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
| League switching | localStorage + StorageEvent | Simple; reactive across components without context provider |
| Dialogs | Custom `ConfirmDialog` (no browser confirm/alert) | Consistent styling; better UX |
| UI framework | Tailwind CSS only | Sufficient at current complexity |
