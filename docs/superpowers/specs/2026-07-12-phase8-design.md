# Phase 8 — Quality Pass Design

**Date:** 2026-07-12
**Scope:** Targeted fixes from the Phase 8 code-review audit. Dead code was clean; error boundaries exist at root level and are sufficient; loading/empty states are mostly complete. Four areas need action.

---

## 1. Accessibility (4 fixes)

### 1.1 GamePage — icon-only buttons

**Files:** `src/pages/GamePage.tsx`

Two buttons use single Unicode characters with no accessible label:

| Button | Symbol | Fix |
|--------|--------|-----|
| Undo   | `↺`    | Add `aria-label={t('game.undo')}` |
| Skip half-inning | `⇥` | Add `aria-label={t('game.skipHalf')}` |

Translation keys `game.undo` and `game.skipHalf` already exist in both `en` and `nl` translation files. No new keys needed.

### 1.2 AdminPage — invite email input missing `<label>`

**File:** `src/pages/AdminPage.tsx`

The invite form has an email input with a placeholder but no associated `<label>` element. Add a visible `<label htmlFor="invite-email">` above the input using the existing `common.email` key ("Email" / "E-mail").

### 1.3 LeagueSettingsPage — invite email input missing `<label>`

**File:** `src/pages/LeagueSettingsPage.tsx`

Same pattern as AdminPage. Add a `<label htmlFor="invite-email">` using `common.email` to the scorer-invite email input.

---

## 2. Edge Function — `ocr-scorecard` auth guard

**File:** `supabase/functions/ocr-scorecard/index.ts`

Add a JWT check at the top of the handler, before any Vision API call:

1. Read the `Authorization` header; return `401` if absent.
2. Create a Supabase client scoped to the user JWT.
3. Call `supabase.auth.getUser()`; return `401` if it errors or returns no user.
4. Continue to Vision API call only on success.

**Rationale:** Anonymous callers can currently invoke this function and burn OpenAI API credits. Any authenticated user (any league member) should be allowed; no role check beyond authenticated is needed.

No client-side changes required.

---

## 3. RLS — `league_invites` UPDATE policy

**File:** new `supabase/migrations/023_tighten_league_invites_rls.sql`

```sql
-- Drop the overly-permissive update policy
drop policy if exists "league members can update invites" on league_invites;

-- Only league admins can update invite rows via the client
create policy "league admins can update invites"
  on league_invites for update
  using (is_league_admin(league_id));
```

**Rationale:** The existing policy uses `using(true)`, allowing any authenticated user to update any invite row. The edge function that marks invites as accepted uses the service role key and bypasses RLS, so this change does not affect invite acceptance. The new policy restricts client-side updates to league admins only (e.g., revoking an invite).

---

## 4. Dexie migration convention — documentation only

**File:** `src/db/local.ts`

Add a one-line comment above the `version(1)` block noting that v1–v7 are grandfathered and had no data-transformation needs, so `upgrade()` handlers were not required. v8+ must include `upgrade()` handlers per the convention in `PLAN.md`.

**File:** `PLAN.md`

Tick the Dexie migration convention audit checkbox in the Phase 8 section.

---

## Out of scope

- Per-route error boundaries — root-level `ErrorBoundary` in `main.tsx` is sufficient.
- Broad a11y sweep across all pages — only the 4 specific gaps above were found.
- `league_members` missing UPDATE policy — no role-change feature exists yet; defer to when that feature is built.
- `get-shared-game` method check — public read-only function, low risk.
- `console.*` calls in services — all are in non-browser contexts (dev/test helpers or service-layer error logging); no action needed.

---

## Files changed

| File | Change |
|------|--------|
| `src/pages/GamePage.tsx` | Add `aria-label` to undo and skip buttons |
| `src/pages/AdminPage.tsx` | Add `<label>` to invite email input |
| `src/pages/LeagueSettingsPage.tsx` | Add `<label>` to invite email input |
| `supabase/functions/ocr-scorecard/index.ts` | Add JWT auth check |
| `supabase/migrations/023_tighten_league_invites_rls.sql` | New migration |
| `src/db/local.ts` | One-line comment above v1 |
| `PLAN.md` | Tick Phase 8 Dexie convention checkbox |

**Tests:** Run `npm run test` and `npx playwright test` after each change. No new tests needed — these are all small targeted fixes, not new logic.
