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
| Local DB | **Dexie.js** (IndexedDB wrapper) | Reliable offline storage, sync-friendly, works in all browsers |
| UI | **Tailwind CSS** | Mobile-first utilities, responsive by default |
| Routing | **React Router v6** | Standard, well-supported |
| OCR | **GPT-4o-mini Vision** (via Supabase Edge Function) | Best accuracy for handwritten KNBSB scorecards; ~€0.01–0.02 per image, ~€1–2/year at hobby scale |

### Backend / Cloud
| Layer | Choice | Why |
|---|---|---|
| Platform | **Supabase** | Auth, PostgreSQL, real-time subscriptions, and REST API in one — free tier is fine for hobby scale |

> **OCR runs server-side via a Supabase Edge Function** that calls GPT-4o-mini Vision. The API key stays on the server, never in the client. Cost is ~€0.01–0.02 per scorecard image — negligible at hobby scale.

### Deployment
- **Frontend**: `baseball.mourits.nu` — self-hosted Linux server, served by **Nginx**
- **SSL**: Let's Encrypt via **Certbot** (free, auto-renews)
- **CI/CD**: **GitHub Actions** — on push to `main`, builds and rsync's `dist/` to server
- **Backend**: Supabase (managed, free tier)

---

## Data Model

```
User
  id, email, created_at

Season
  id, user_id
  name, year
  start_date, end_date
  is_active
  created_at, updated_at

Team
  id, user_id, name
  created_at, updated_at

Player
  id, team_id
  name, jersey_number
  primary_position, secondary_positions[]
  deleted_at        ← soft delete; null = active
  created_at, updated_at

Game
  id, user_id, season_id
  date, location
  home_team_id, away_team_id
  home_score, away_score
  innings_complete (0–9+)
  status: draft | in_progress | final
  created_at, updated_at, synced_at

Inning
  id, game_id
  inning_number (1–9+)
  half: top | bottom

AtBat
  id, inning_id
  batter_id, pitcher_id
  result: 1B | 2B | 3B | HR | BB | K | HBP | RoE | SAC | SF | FC | GDP | ...
  rbi_count
  fielding_credits[]    ← who made the out (position numbers)
  baserunning_events[]  ← SB, CS, WP, PB, balk, pickoff

FieldingCredit
  at_bat_id, player_id
  credit_type: putout | assist | error
  sequence_number

BaserunningEvent
  at_bat_id, runner_id
  event_type: SB | CS | WP | PB | balk | pickoff | scored | stranded

PitchingLine
  id, game_id, player_id
  outs_recorded (displayed as x.1 / x.2)
  hits_allowed, runs_allowed, earned_runs
  walks, strikeouts, hbp
  is_winning_pitcher, is_losing_pitcher, is_save
  created_at, updated_at
```

All local records use a client-generated UUID as primary key and carry a `_dirty` flag for sync. Local Dexie schema mirrors the above with camelCase field names.

### Dexie version history
| Version | Change |
|---|---|
| v1 | teams, players (initial) |
| v2 | added games, innings, atBats, fieldingCredits, baserunningEvents, pitchingLines; players had `lineupOrder` index |
| v3 | forced upgrade past stale browser state (same schema as v2) |
| v4 | dropped `lineupOrder` index from players; `secondaryPositions` stored as plain array |
| v5 | added `seasons` table; added `seasonId` index to games |

> **Never downgrade the Dexie version number.** Browsers reject it with a VersionError.

---

## Feature Breakdown

### 1. Team & Roster Management ✅
- Create / rename / delete teams
- Add / edit players: name, jersey number, primary position, secondary positions (multi-select chip UI)
- Lineup order is **per-game**, not a player attribute
- Soft delete players: `deletedAt` timestamp instead of physical removal — preserves game history
- Roster view shows active players; toggle switch reveals inactive players with a Reactivate button
- "Add another" button on the player form for fast batch entry
- Local-first storage + sync with Supabase (dirty-flag + upsert pattern)
- DB migration runner: `npm run migrate` applies all `supabase/migrations/*.sql` files in order

### 2. Seasons ✅
- Seasons group games and stats; rosters are team-wide but games belong to a season
- Season fields: name, year, start/end dates (optional), isActive flag
- First season created is automatically set as active
- Seasons page (📅 nav): list, create, set active, delete
- Seasons sync to Supabase alongside teams and players

### 3. Play-by-Play Scoring (Phase 2)

**UI flow:**
1. Start Game → pick home/away teams, season, date, location, starting pitchers, lineup order
2. Game screen shows current inning, half, batter in lineup order
3. Per at-bat: tap result type (buttons for each outcome)
4. For outs: tap which fielder(s) made the play (position number grid 1–9)
5. For hits: indicate where runners moved
6. Baserunning events (SB, CS, WP, etc.) recorded between at-bats
7. Auto-advance to next batter; auto-switch half-inning at 3 outs
8. Score updates live in the header; pitching lines updated automatically

**Result buttons (tappable):**
- Hits: 1B, 2B, 3B, HR
- Non-hits reaching base: BB, HBP, RoE, FC
- Outs: K (swinging/looking), SAC, SF, GDP, FO (flyout)
- Special: WP, PB, balk, SB, CS (between at-bats)
- Pitching change: substitute pitcher mid-inning (splits the PitchingLine)

### 4. Image Upload → Game Log (Phase 3)

**Flow:**
1. User taps "Upload Scorecard" and picks a photo (camera or gallery)
2. Image is sent to a Supabase Edge Function (API key never touches the client)
3. Edge Function calls GPT-4o-mini Vision with a structured prompt describing the KNBSB scorecard format and requesting a strict JSON game log
4. Result rendered as a review form — each inning/at-bat listed with confidence indicators
5. Entries the model flagged as uncertain highlighted; user corrects before saving
6. Corrected game log saved to IndexedDB and queued for sync

**KNBSB notation the prompt covers:**
- **Circle = OUT**: `(K)` = strikeout, `(F8)` = flyout to CF, `(6-3)` = groundout SS→1B, `(6-4-3)` = double play
- **Uncircled = reached base**: `W`/`BB` = walk, `HP`/`HBP` = hit by pitch, `HR`, `2B`/`DB`, `3B`, `SB`, `E6` = error, `FC` = fielder's choice
- **`(SC)` circled** = caught stealing
- **Runner tracking**: `+` or `↑` = run scored, `x` = out/stranded
- **Column wrapping**: slashed column header = lineup turned over in same inning

**Cost:** ~€0.01–0.02 per image. At 50–100 games/year, under €2/year total.

### 5. Statistics Engine (Phase 4)

Stats computed on-the-fly from the game log — no separate stats table.

**Hitting stats:** G, AB, PA, H, 1B, 2B, 3B, HR, R, RBI, BB, HBP, RoE, K, SAC, SF, AVG, OBP, SLG, OPS

**Fielding stats:** PO, A, E, DP, FLD%

**Pitching stats:** G, GS, IP, H, R, ER, BB, K, HBP, W, L, SV, ERA, WHIP

**Export:**
- **Stats → Excel (.xlsx)**: separate sheets for hitting, pitching, fielding; one row per player
- **Box score → Printable HTML**: clean print stylesheet; user does File → Print → Save as PDF

**Views:** box score (per game), season totals (per player), team game log (W/L record)

### 6. Offline-First + Multi-Device Sync (Phase 5)

- Full app shell cached by service worker on first load
- All reads from IndexedDB; all writes go local first, then queued for Supabase sync
- `_dirty` flag marks unsynced records; background flush on `online` event
- Conflict resolution: **last-write-wins by `updated_at`** (sufficient for single-user hobby use)
- Supabase real-time subscription pushes live game updates to other open sessions
- "Resume on this device" pulls latest server state into local IndexedDB

---

## Build Phases

### Phase 0 — Project Setup ✅
- [x] Scaffold Vite + React + TypeScript + Tailwind
- [x] Configure vite-plugin-pwa (manifest, service worker, offline fallback)
- [x] Configure Dexie.js schema
- [x] Set up Supabase project (auth, database schema, RLS policies)
- [x] Auth screens: sign up, log in, log out

### Phase 1 — Teams, Roster & Seasons ✅
- [x] Team creation / rename / delete
- [x] Player add / edit — name, jersey number, primary + secondary positions (chip UI)
- [x] Soft delete players (preserve game history); reactivate from inactive list
- [x] "Add another" fast entry flow on player form
- [x] Season model: create, set active, delete; games linked to season
- [x] Seasons page in bottom nav
- [x] Local-first storage + sync to Supabase (teams, players, seasons)
- [x] DB migration runner (`npm run migrate`) for Supabase schema changes
- [x] Custom in-app `ConfirmDialog` component (no browser `confirm()` / `alert()`)
- [x] Supabase migrations: 001 lineup_order, 002 player positions, 003 soft delete + seasons

### Phase 2 — Play-by-Play Scoring ✅
- [x] New game screen: pick season, teams, date, location, set lineup order, pick starting pitchers
- [x] Scoring UI: batter card, result buttons, fielder selection grid (1–9)
- [x] Baserunner state tracker (runners on base, auto-advance on hits/outs)
- [x] Baserunning events between at-bats (SB, CS, WP, PB, balk)
- [x] Pitching change flow (mid-inning substitution via sub menu; pitcher shown in scoreboard)
- [x] Auto-advance batter; auto-switch half-inning at 3 outs
- [x] Live scoreboard header (score, inning, outs)
- [x] Save / resume in-progress game (localStorage persistence across refreshes)
- [x] Game list on home screen (by season, with status badges)
- [x] Undo (unlimited stack, persisted across refresh)
- [x] Runner outcomes per play; between-at-bat events (SB/CS/WP/PB/BALK)
- [x] Inning-end animation; skip to next half-inning with run prompt
- [x] Delete game; end game flow → summary
- [x] Previous at-bat results shown inline on batter card

### Phase 3 — Image Upload & OCR ⏳ (blocked on OpenAI credits)
- [x] Write GPT-4o-mini system prompt covering KNBSB notation
- [x] Supabase Edge Function: receive image → call GPT-4o-mini Vision → return JSON game log
- [x] Camera / file upload UI (📷 Take photo + 🖼️ Choose file; drag-and-drop)
- [x] Review & correction screen (confidence indicators, editable results, saves to Dexie)
- [x] Routes wired: /games/upload and /games/upload/review; 📷 button on HomePage
- [ ] End-to-end test with real scorecard (blocked: needs OpenAI credits on platform.openai.com)

### Phase 4 — Statistics & Export (partial ✅)
- [x] Stats computation functions — batting (AVG/OBP/SLG/OPS/PA/HR/RBI/BB/K) and pitching (IP/K/BB/H/R/ERA/W/L)
- [x] Box score / game summary page (linescore + batting + pitching lines per team)
- [x] Season stats view: sortable player table on TeamDetailPage; individual PlayerStatsPage with game log
- [x] Pitching: ERA, W/L decisions, innings pitched on all stats pages
- [ ] Excel (.xlsx) export for season stats
- [ ] Print-optimized box score layout
- [ ] Fielding stats (PO, A, E, FLD%)

### Phase 5 — Sync & Multi-Device (partial ✅)
- [x] Sync queue with retry logic and online/offline detection (teams, players, seasons, games, innings, at-bats)
- [ ] Supabase real-time subscription for in-progress games
- [ ] "Resume on this device" flow
- [ ] Sync status indicator in UI

### Phase 6 — Deployment & Polish ❌ Not started
- [ ] DNS A record: `baseball.mourits.nu` → server IP
- [ ] Install Nginx; apply `nginx/baseball.mourits.nu.conf`
- [ ] Certbot SSL (`sudo certbot --nginx -d baseball.mourits.nu`)
- [ ] GitHub Actions secrets + push-to-deploy pipeline
- [ ] PWA install prompt (iOS and Android)
- [ ] Offline indicator banner
- [ ] Error boundaries and empty states
- [ ] End-to-end testing on mobile (Safari iOS, Chrome Android)

---

## Key Decisions & Assumptions

| Decision | Choice | Rationale |
|---|---|---|
| Single codebase | PWA (not React Native) | Fastest path, no app store friction, offline-capable |
| Auth | Supabase Auth (email + password) | Simple, built-in, no extra service |
| OCR | GPT-4o-mini Vision (server-side) | Best accuracy for handwritten KNBSB format; ~€2/year at hobby scale |
| Offline storage | Dexie.js (IndexedDB) | Persistent, works in all modern browsers including Safari |
| Conflict resolution | Last-write-wins by `updated_at` | Sufficient for single-user hobby use; simpler than CRDT |
| Stats storage | Computed on-the-fly | Avoids stale stats; game log is the source of truth |
| Stats export | Excel (.xlsx) | Requested by user |
| Box score export | Printable HTML (browser → PDF) | No extra dependency; user controls PDF output |
| Scoring notation | Custom tap-based UI | More usable on mobile than typing codes |
| Pitcher stats | Tracked per game, aggregated to season | IP, H, R, ER, BB, K, HBP, W/L/SV, ERA, WHIP |
| Lineup order | Per-game attribute, not per-player | Players can bat in different spots each game |
| Player positions | Primary + secondary (multi-select) | Flexible for utility players and DH |
| Player deletion | Soft delete (`deleted_at`) | Preserves player references in historical game data |
| Seasons | First-class model; games belong to a season | Organises stats and rosters by competitive period |
| Dialogs | Custom `ConfirmDialog` component | Browser `confirm()`/`alert()` is bad practice; in-app dialogs are consistent with app styling |
| UI framework | Tailwind CSS only (no shadcn/ui) | shadcn/ui not needed at current complexity; Tailwind utilities are sufficient |

---

## Estimated Effort

| Phase | Effort |
|---|---|
| Setup | ✅ done |
| Teams, Roster & Seasons | ✅ done |
| Play-by-play Scoring | 1–2 weeks (most complex UX) |
| Image OCR | 1 week |
| Statistics & Export | 4–6 days |
| Sync | 3–5 days |
| Deployment & Polish | 3–5 days |
| **Remaining** | **~5–7 weeks** |

Phase 2 (scoring UI) carries the most complexity: baserunner state, fielder selection, and lineup management all need to feel natural on a small mobile screen.
