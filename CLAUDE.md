# CLAUDE.md — Baseball Scoring App

Project-specific knowledge for AI-assisted development. Read this before making changes.

## Stack

- React 18 + TypeScript + Vite — SPA, no SSR
- Tailwind CSS — utility-first, darkMode: 'class'
- Dexie.js v7 — local-first IndexedDB ORM
- Supabase — Postgres backend, RLS, Edge Functions, Auth
- vite-plugin-pwa — PWA with service worker; deployed at baseball.mourits.nu
- React Router v6 — Outlet-based layout with AppShell
- react-i18next — i18n, English + Dutch, Dutch default

## Critical File-Write Convention

ALWAYS use bash heredoc or Python for files >100 lines.
The Edit and Write tools silently truncate large files, corrupting the output.

Use Python for large files:

    with open('/path/to/file.tsx', 'w') as f:
        f.write(content)

Never use the Edit or Write tool on any file that is or will become >100 lines.

## No Native Dialogs

Never use alert(), confirm(), or prompt(). Always use the ConfirmDialog component:

    import ConfirmDialog from '../components/ConfirmDialog'

    // Destructive confirmation:
    <ConfirmDialog
      open={showConfirm}
      title="Delete player?"
      message="This cannot be undone."
      onConfirm={handleDelete}
      onCancel={() => setShowConfirm(false)}
    />

    // Non-destructive alert (OK only):
    <ConfirmDialog
      open={showAlert}
      title="Invite sent"
      message="The invite link has been copied."
      alertOnly
      onConfirm={() => setShowAlert(false)}
    />

## Internationalisation (i18n)

All user-visible strings must use react-i18next. Never add hardcoded UI strings.

Pattern:

    import { useTranslation } from 'react-i18next'
    const { t } = useTranslation()
    // then: t('namespace.key') or t('namespace.key', { var: value })

Translation files: src/locales/en/translation.json and src/locales/nl/translation.json
i18n config:       src/i18n.ts  (imported once in src/main.tsx)

Language detection: browser locale -> localStorage key 'i18nextLng'. Default: 'nl'.
Language toggle: LeagueSettingsPage — uses i18n.changeLanguage('en' | 'nl').

Key namespaces: nav, common, shell, auth, home, newGame, game, gameSummary,
playerStats, teams, teamDetail, playerForm, seasons, stats, league, help,
admin, invite, signupInvite, scorecard, review, watch, onboarding, runners,
betweenEvents, substitution.

Baseball abbreviations (1B, 2B, 3B, HR, BB, HBP, K, RoE, FC, SAC, SF, GDP,
FO, GO, SB, CS, WP, PB, BALK, AVG, OBP, SLG, OPS, ERA, WHIP, IP, AB, PA,
RBI, R, H, E) are universal and must NOT be translated.

## Dark Mode

Architecture: darkMode: 'class' in tailwind.config.ts. The .dark class lives on <html>.

Flash prevention: A blocking <script> in index.html reads localStorage.theme before React loads
and applies .dark immediately. Do not remove this script.

Toggle hook: src/hooks/useTheme.ts — call wherever you need a toggle. Currently called only
in LeagueSettingsPage. No context/provider needed since there is only one toggle point.

Brand color dark-mode mappings (brand-500/600/700 are dark navy — invisible on dark backgrounds):
  text-brand-500  ->  dark:text-brand-100
  bg-brand-50     ->  dark:bg-blue-900/20
  border-brand-300 -> dark:border-blue-700
  bg-brand-100    ->  dark:bg-blue-900/30

After adding any new Tailwind classes, run `npm run build` to regenerate dist/ CSS.
The dev server (npm run dev) picks them up via JIT immediately, but the static bundle
must be rebuilt before deploying.

## Brand Color Scale

    brand: {
      50:  '#eff6ff',  // near-white blue
      100: '#dbeafe',  // light blue — use for dark-mode text
      500: '#1e3a5f',  // dark navy — the primary brand color
      600: '#162f50',
      700: '#0f2340',
      800: '#0a1830',
      900: '#050c18',
    }

No brand-200, brand-300, or brand-400 are defined.

## Local-First Data Architecture

Every writable entity has a _dirty: boolean flag. The sync hook reads all dirty records
and upserts them to Supabase.

Sync pattern:
  Mark dirty on create/update: await db.players.put({ ...player, _dirty: true })
  After successful upsert: await db.players.update(player.id, { _dirty: false })

Pull / prune pattern (server is authoritative — delete local records server no longer returns):

    const serverIds = new Set(serverRecords.map(r => r.id))
    const localRecords = await db.players.where('teamId').equals(teamId).toArray()
    const toDelete = localRecords.filter(p => !serverIds.has(p.id))
    await db.players.bulkDelete(toDelete.map(p => p.id))

League isolation: All queries must filter by leagueId.
Active league stored in localStorage('currentLeagueId'), exposed via useLeague():

    const { league, leagues, switchLeague } = useLeague()

Sign-out: Must clear ALL Dexie tables AND localStorage.removeItem('currentLeagueId').
Failing to do this leaves stale data visible to the next user on the same device.

## Supabase Setup

- Project: prod only (no dev environment — running on free tier)
- Migrations: supabase/migrations/ — run with `supabase db push`

**NEVER do anything locally that has impact on production.**
Migrations are applied to production exclusively via the GitHub deploy action — never via `supabase db push`, `supabase db query`, or any local CLI/dashboard command.
To deploy a migration: create the file in supabase/migrations/, commit it, and push to the deploy branch.
- Edge Functions: supabase/functions/ — deploy with `supabase functions deploy <name>`
- RLS helper functions (all security definer):
    is_site_admin()             checks site_admins table
    is_league_member(league_id) checks league_members
    is_league_admin(league_id)  checks league_members.role = 'admin'

Invite-only signup:
  Auth toggle in Supabase Dashboard -> Auth -> Settings -> "Enable signups" OFF.
  Invites via site-invite Edge Function using admin.createUser({ email_confirm: true }).
  Stored in site_invites table (name, email, invited_by, used_at).
  Implementation uses name-based invites (not Supabase inviteUserByEmail).

Soft ban (user removal):
  Use updateUserById(id, { ban_duration: '876000h' }).
  Never hard-delete auth users — FK constraints on game/player data will break.

## Key Files

  src/db/local.ts                        Dexie schema — all local types and DB versions
  src/hooks/useSync.ts                   Orchestrates push/pull for all entities
  src/hooks/useLeague.ts                 Active league state, switchLeague()
  src/hooks/useTheme.ts                  Dark mode toggle, persists to localStorage
  src/hooks/useWakeLock.ts               Screen wake lock — active on GamePage only
  src/i18n.ts                            i18next setup; imports bundled locale JSON files
  src/locales/en/translation.json        English strings (~230 keys)
  src/locales/nl/translation.json        Dutch strings (~230 keys)
  src/components/layout/AppShell.tsx     Root layout: sync banner, update banner, Outlet
  src/components/ConfirmDialog.tsx       All confirmation/alert dialogs
  src/pages/LeagueSettingsPage.tsx       League management + dark mode + language toggle
  tailwind.config.ts                     Brand colors + darkMode: class
  index.html                             Blocking theme script to prevent flash
  supabase/functions/                    Edge Functions (site-invite, etc.)
  PLAN.md                                Feature roadmap with completion status

## Database Versions (Dexie)

Always add a new .version(N).stores({}) block — never modify existing version blocks.
Only index fields you need to query by; store everything else as plain object properties.

Current version: v7 (adds leagues table, leagueId indexes on teams/seasons/games).

## Build & Deploy

  npm run dev      Vite dev server with Tailwind JIT — instant reload, no build needed
  npm run build    Produces dist/ — required before deploying

Deploy by copying dist/ to the server. Nginx config in nginx/.

## PLAN.md Status (as of 2026-06-21)

  DONE  Phase 1-6: Core scoring, sync, auth, seasons, lineups, league management
  DONE  Phase 7.1: Invite-only signup
  DONE  Phase 7.4: Dark mode
  DONE  Phase 11: Internationalisation (English + Dutch)
  TODO  Phase 7.5: Import schedule from CSV
  SKIP  Phase 7.2: Dev Supabase environment (advised against for free tier)
  TODO  Phase 4 remaining: Excel export, print box score, fielding stats
  DONE  Phase 8 (partial): 169 Vitest unit tests + 22 Playwright E2E tests passing
  TODO  Phase 8 remaining: code review pass (error boundaries, a11y, RLS audit, dead code)
