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
| State / Sync | **TanStack Query** | Handles background sync, stale-while-revalidate, retries |
| UI | **Tailwind CSS + shadcn/ui** | Mobile-first components, responsive by default |
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

Team
  id, user_id, name

Player
  id, team_id, name, jersey_number, primary_position

Game
  id, user_id
  date, location
  home_team_id, away_team_id
  home_score, away_score
  innings_complete (0-9+)
  status: draft | in_progress | final
  created_at, updated_at, synced_at

Inning
  id, game_id
  inning_number (1-9+)
  half: top | bottom

AtBat
  id, inning_id
  batter_id, pitcher_id
  result: 1B | 2B | 3B | HR | BB | K | HBP | RoE | SAC | SF | FC | GDP | ...
  rbi_count
  fielding_credits[]    ← who made the out (position numbers)
  baserunning_events[]  ← SB, CS, WP, PB, balk, pickoff

FieldingCredit
  player_id, credit_type: putout | assist | error
  at_bat_id

BaserunningEvent
  at_bat_id, runner_id
  event_type: SB | CS | WP | PB | balk | pickoff | scored | stranded

PitchingLine
  id, game_id, player_id
  innings_pitched (stored as outs recorded, displayed as x.y)
  hits_allowed, runs_allowed, earned_runs
  walks, strikeouts, hbp
  is_winning_pitcher, is_losing_pitcher, is_save
```

All records get a `local_id` (UUID generated on device) and an optional `server_id`. This is the key to conflict-free offline sync.

---

## Feature Breakdown

### 1. Team & Roster Management
- Create teams with names
- Add/edit players (name, number, position)
- Set lineup order per game (including designated starting pitcher)
- Local-first: stored in IndexedDB, synced when online

### 2. Play-by-Play Scoring

**UI flow:**
1. Start Game → pick home/away teams, date, location, starting pitchers
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

### 3. Image Upload → Game Log

**Approach: GPT-4o-mini Vision via Supabase Edge Function**

**Flow:**
1. User taps "Upload Scorecard" and picks a photo (camera or gallery)
2. Image is sent to a Supabase Edge Function (API key never touches the client)
3. Edge Function calls GPT-4o-mini Vision with a structured prompt describing the KNBSB scorecard format and requesting a strict JSON game log
4. Result rendered as a review form — each inning/at-bat listed with confidence indicators
5. Entries the model flagged as uncertain highlighted in yellow; user corrects before saving
6. Corrected game log saved to IndexedDB and queued for sync

**Notation the prompt will teach the model:**
The model is given a detailed system prompt covering the KNBSB Dutch scorecard conventions, confirmed from real examples:
- **Circle = OUT**: `(K)` = strikeout, `(F8)` = flyout to CF, `(6-3)` = groundout SS→1B, `(6-4-3)` = double play
- **Uncircled = reached base**: `W`/`BB` = walk, `HP`/`HBP` = hit by pitch, `HR`, `2B`/`DB`, `3B`, `SB`, `E6` = error, `FC` = fielder's choice
- **`(SC)` circled** = caught stealing
- **Runner tracking**: each line in a cell tracks a baserunner's position and movement; `+` or `↑` = run scored, `x` = out/stranded
- **Column wrapping**: a slashed/crossed column header means the lineup turned over — same inning, second pass through the order

**Cost:** ~€0.01–0.02 per image. At 50–100 games/year, under €2/year total.

**Realistic accuracy expectation:** 85–95% on legible photos. The review step handles the rest.

### 4. Statistics Engine

Stats are computed on-the-fly from the game log. No separate stats table needed — game log is always the source of truth.

**Hitting stats per player:**
| Stat | Notes |
|---|---|
| G, AB, PA | Plate appearances vs at-bats (BB/HBP/SAC excluded from AB) |
| H, 1B, 2B, 3B, HR | Hit breakdown |
| R, RBI | Runs and RBI |
| BB, HBP | Walks and hit by pitch |
| RoE | Reached on error |
| K | Strikeouts |
| SAC, SF | Sacrifice hits and flies |
| AVG | H / AB |
| OBP | (H + BB + HBP) / (AB + BB + HBP + SF) |
| SLG | Total bases / AB |
| OPS | OBP + SLG |

**Fielding stats per player:**
| Stat | Formula |
|---|---|
| PO | Putouts |
| A | Assists |
| E | Errors |
| DP | Double plays participated in |
| FLD% | (PO + A) / (PO + A + E) |

**Pitching stats per player:**
| Stat | Notes |
|---|---|
| G, GS | Games / games started |
| IP | Innings pitched (stored as outs, displayed as x.1 / x.2) |
| H, R, ER | Hits, runs, earned runs allowed |
| BB, K, HBP | As pitcher |
| W, L, SV | Win/loss/save decisions |
| ERA | (ER × 9) / IP |
| WHIP | (BB + H) / IP |

**Export:**
- **Stats → Excel (.xlsx)**: Separate sheets for hitting, pitching, fielding; one row per player; sortable columns
- **Box score / game log → Printable HTML**: Clean print stylesheet; user does File → Print → Save as PDF from browser

**Views:**
- Box score (single game)
- Season totals (all games, per player)
- Team game log (game-by-game results with W/L record)

### 5. Offline-First + Multi-Device Sync

**Offline:**
- Full app shell cached by service worker on first load
- All data reads from IndexedDB
- All writes go to IndexedDB first, then queued for sync
- Sync queue survives page refresh / app close

**Sync strategy:**
- When the app comes online, flush the sync queue to Supabase
- Conflict resolution: **last-write-wins by `updated_at` timestamp** (sufficient for single-user hobby use)
- Server is source of truth when the same game is opened on two devices

**Multi-device resume:**
- Games with `status: in_progress` are listed on the home screen after login on any device
- Supabase real-time subscription pushes live updates to any other open session
- "Resume on this device" pulls latest server state into local IndexedDB

---

## Build Phases

### Phase 0 — Project Setup (Week 1)

**Code & tooling:**
- [ ] Scaffold Vite + React + TypeScript + Tailwind project
- [ ] Configure vite-plugin-pwa (manifest, service worker, offline fallback)
- [ ] Configure Dexie.js schema mirroring Supabase tables
- [ ] Set up Supabase project (auth, database schema, RLS policies)
- [ ] Auth screens: sign up, log in, log out

**Server & deployment (baseball.mourits.nu):**
- [ ] Add DNS A record: `baseball.mourits.nu` → server IP
- [ ] Install Nginx on server; configure to serve `dist/` with SPA fallback
- [ ] Run Certbot for `baseball.mourits.nu` (Let's Encrypt SSL, auto-renew)
- [ ] Create GitHub Actions workflow: on push to `main` → `npm run build` → rsync `dist/` to server
- [ ] Smoke-test: confirm app loads over HTTPS on `baseball.mourits.nu`

### Phase 1 — Teams & Roster (Week 1–2)
- [ ] Team creation / edit / delete
- [ ] Player management (add, edit, reorder lineup)
- [ ] Local-first storage + sync with Supabase

### Phase 2 — Play-by-Play Scoring (Week 2–4)
- [ ] Start game screen (teams, date, starting pitchers)
- [ ] Scoring UI: batter card, result buttons, fielder selection
- [ ] Baserunning event entry
- [ ] Pitching change flow (mid-inning substitution)
- [ ] Auto-advance batter / half-inning logic
- [ ] Live scoreboard header
- [ ] Save / resume in-progress game

### Phase 3 — Image Upload & OCR (Week 4–5)
- [ ] Write GPT-4o-mini system prompt covering KNBSB notation (informed by 6 real example scorecards)
- [ ] Supabase Edge Function: receive image, call GPT-4o-mini Vision, return structured JSON
- [ ] Camera / file upload UI
- [ ] Review & correction screen (yellow highlights for uncertain cells)
- [ ] Save corrected game log

### Phase 4 — Statistics & Export (Week 5–6)
- [ ] Stats computation functions (hitting, fielding, pitching) — pure functions, unit tested
- [ ] Box score view (per game) with print stylesheet
- [ ] Season stats view (all games, per player)
- [ ] Sortable stat tables
- [ ] Excel (.xlsx) export for season stats
- [ ] Print-optimized box score layout

### Phase 5 — Sync & Multi-Device (Week 6–7)
- [ ] Sync queue implementation (retry logic, online/offline detection)
- [ ] Supabase real-time subscription for in-progress games
- [ ] "Resume on this device" flow
- [ ] Sync status indicator in UI

### Phase 6 — Polish (Week 7–8)
- [ ] PWA install prompt (iOS and Android)
- [ ] Offline indicator banner
- [ ] Error boundaries and empty states
- [ ] Dark mode
- [ ] End-to-end testing on mobile browsers (Safari iOS, Chrome Android)

---

## Key Decisions & Assumptions

| Decision | Choice | Rationale |
|---|---|---|
| Single codebase | PWA (not React Native) | Fastest path, no app store friction, offline-capable |
| Auth | Supabase Auth (email + password) | Simple, built-in, no extra service |
| OCR | GPT-4o-mini Vision (server-side) | Best accuracy for handwritten KNBSB format; ~€2/year at hobby scale |
| Offline storage | Dexie.js (IndexedDB) | Persistent, works in all modern browsers including Safari |
| Conflict resolution | Last-write-wins | Sufficient for single-user hobby use; simpler than CRDT |
| Stats storage | Computed on-the-fly | Avoids stale stats; game log is the source of truth |
| Stats export | Excel (.xlsx) | Requested by user |
| Box score export | Printable HTML (browser → PDF) | No extra dependency; user controls PDF output |
| Scoring notation | Custom tap-based UI | More usable on mobile than typing codes |
| Pitcher stats | Tracked per game, aggregated to season | IP, H, R, ER, BB, K, HBP, W/L/SV, ERA, WHIP |

---

## Estimated Effort

| Phase | Effort |
|---|---|
| Setup | 3–5 days |
| Teams & Roster | 2–3 days |
| Play-by-play Scoring | 1–2 weeks (most complex UX) |
| Image OCR | 1 week (Tesseract integration + parser tuning) |
| Statistics & Export | 4–6 days |
| Sync | 3–5 days |
| Polish | 3–5 days |
| **Total** | **~6–8 weeks** (solo developer) |

Phases 2 (scoring UI) and 3 (OCR parser tuning) carry the most uncertainty. Phase 2 complexity is in the UX — getting baserunner state and fielding credits to feel natural on a small screen. Phase 3 depends on how consistently your scorecards are written; clean consistent handwriting makes a big difference.
