# Phase 8 Quality Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all Phase 8 quality-pass gaps: 4 a11y fixes, an edge-function auth guard, an RLS policy tightening, and Dexie convention documentation.

**Architecture:** All changes are surgical and independent. No new components or abstractions. The edge-function auth guard follows the identical pattern used in `admin-users/index.ts`. The RLS migration follows the established migration-file-only convention (never run against prod directly).

**Tech Stack:** React 18 + TypeScript, react-i18next, Supabase Edge Functions (Deno), PostgreSQL RLS, Dexie.js v8.

## Global Constraints

- **File size rule:** All source files in this project exceed 100 lines. Use Python `str.replace()` scripts for ALL file edits — never the Write or Edit tools on these files, as they silently truncate.
- **No direct prod DB:** Never run `supabase db push` or any SQL directly. Migrations deploy automatically via CI/CD on push to the deploy branch.
- **i18n:** Every user-visible string must use `t('key')`. Never hardcode UI strings.
- **Tests must pass before commit:** Run `npm run test` (169 Vitest unit tests) and `npx playwright test` (22 E2E tests) before each commit. Fix any failure before proceeding.

---

### Task 1: A11y — GamePage icon buttons + undo translation key

**Files:**
- Modify: `src/pages/GamePage.tsx`
- Modify: `src/locales/en/translation.json`
- Modify: `src/locales/nl/translation.json`

**Context:** The undo button (`↺`) and skip button (`⇥`) are icon-only with no accessible label. The skip button has `title={t('game.skipHalfInning')}` and `game.skipHalfInning` exists in both locales. The undo button has neither an `aria-label` nor a `game.undo` key — add both. Adding `aria-label` alongside `title` on the skip button is correct; they serve different roles (screen reader vs. mouse tooltip).

- [ ] **Step 1: Add `game.undo` to English translations**

Save and run this as a Python script from the project root:

```python
path = 'src/locales/en/translation.json'
text = open(path, encoding='utf-8').read()
old = '    "skipHalfInning": "Skip to next half-inning",'
new = '    "skipHalfInning": "Skip to next half-inning",\n    "undo": "Undo",'
assert old in text, f'Pattern not found in {path}'
open(path, 'w', encoding='utf-8').write(text.replace(old, new, 1))
print('Done')
```

Expected: prints `Done`.

- [ ] **Step 2: Add `game.undo` to Dutch translations**

```python
path = 'src/locales/nl/translation.json'
text = open(path, encoding='utf-8').read()
old = '    "skipHalfInning": "Doorgaan naar volgende halve inning",'
new = '    "skipHalfInning": "Doorgaan naar volgende halve inning",\n    "undo": "Ongedaan maken",'
assert old in text, f'Pattern not found in {path}'
open(path, 'w', encoding='utf-8').write(text.replace(old, new, 1))
print('Done')
```

- [ ] **Step 3: Add `aria-label` to undo button**

The undo button opens with `<button onClick={handleUndo} disabled={!canUndo}`. Add `aria-label`:

```python
path = 'src/pages/GamePage.tsx'
text = open(path, encoding='utf-8').read()
old = '<button onClick={handleUndo} disabled={!canUndo}'
new = '<button onClick={handleUndo} disabled={!canUndo} aria-label={t(\'game.undo\')}'
assert old in text, f'Pattern not found in {path}'
open(path, 'w', encoding='utf-8').write(text.replace(old, new, 1))
print('Done')
```

- [ ] **Step 4: Add `aria-label` to skip button**

The skip button has `title={t('game.skipHalfInning')}>`. Add `aria-label` before `>`:

```python
path = 'src/pages/GamePage.tsx'
text = open(path, encoding='utf-8').read()
old = "          title={t('game.skipHalfInning')}>\n          ⇥"
new = "          title={t('game.skipHalfInning')} aria-label={t('game.skipHalfInning')}>\n          ⇥"
assert old in text, f'Pattern not found in {path}'
open(path, 'w', encoding='utf-8').write(text.replace(old, new, 1))
print('Done')
```

- [ ] **Step 5: Run tests**

```
npm run test
npx playwright test
```

Expected: 169 unit tests pass, 22 E2E tests pass (1 skipped is fine).

- [ ] **Step 6: Commit**

```bash
git add src/pages/GamePage.tsx src/locales/en/translation.json src/locales/nl/translation.json
git commit -m "fix(a11y): add aria-label to undo and skip buttons in GamePage"
```

---

### Task 2: A11y — Missing form labels in AdminPage and LeagueSettingsPage

**Files:**
- Modify: `src/pages/AdminPage.tsx`
- Modify: `src/pages/LeagueSettingsPage.tsx`

**Context:** Two inputs have only a `placeholder` and no associated `<label>`, making them inaccessible to screen readers and form-automation tools.

- `AdminPage.tsx`: The invite creation input takes a **name/label** for the invite (e.g. "Jan de Vries"). Add `id="invite-name"` to the input and a `<label htmlFor="invite-name">` using `t('common.name')` ("Name" / "Naam").
- `LeagueSettingsPage.tsx`: The scorer-invite input takes an **email address**. Add `id="invite-email"` to the input and a `<label htmlFor="invite-email">` using `t('common.email')` ("Email" / "E-mail").

Both translation keys (`common.name`, `common.email`) already exist in both locales.

- [ ] **Step 1: Add label + id to AdminPage invite input**

The target block in AdminPage.tsx is:
```tsx
        <div className="flex gap-2">
          <input
            value={invName}
```

Replace with (label added above the flex row, `id` added to input):

```python
path = 'src/pages/AdminPage.tsx'
text = open(path, encoding='utf-8').read()
old = '        <div className="flex gap-2">\n          <input\n            value={invName}'
new = (
    '        <label htmlFor="invite-name" className="block text-sm text-gray-700 dark:text-gray-300 mb-1">\n'
    '          {t(\'common.name\')}\n'
    '        </label>\n'
    '        <div className="flex gap-2">\n          <input\n            id="invite-name"\n            value={invName}'
)
assert old in text, f'Pattern not found in {path}'
open(path, 'w', encoding='utf-8').write(text.replace(old, new, 1))
print('Done')
```

- [ ] **Step 2: Add label + id to LeagueSettingsPage scorer-invite input**

The target block in LeagueSettingsPage.tsx is:
```tsx
          <div className="flex gap-2">
            <input
              type="email"
              value={inviteEmail}
```

Replace with:

```python
path = 'src/pages/LeagueSettingsPage.tsx'
text = open(path, encoding='utf-8').read()
old = '          <div className="flex gap-2">\n            <input\n              type="email"\n              value={inviteEmail}'
new = (
    '          <label htmlFor="invite-email" className="block text-sm text-gray-700 dark:text-gray-300 mb-1">\n'
    '            {t(\'common.email\')}\n'
    '          </label>\n'
    '          <div className="flex gap-2">\n            <input\n              id="invite-email"\n              type="email"\n              value={inviteEmail}'
)
assert old in text, f'Pattern not found in {path}'
open(path, 'w', encoding='utf-8').write(text.replace(old, new, 1))
print('Done')
```

- [ ] **Step 3: Run tests**

```
npm run test
npx playwright test
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/pages/AdminPage.tsx src/pages/LeagueSettingsPage.tsx
git commit -m "fix(a11y): add form labels to AdminPage and LeagueSettingsPage invite inputs"
```

---

### Task 3: Edge Function — `ocr-scorecard` auth guard

**Files:**
- Modify: `supabase/functions/ocr-scorecard/index.ts`

**Context:** The function has no authentication check. Any anonymous HTTP caller can invoke it and burn OpenAI API credits. Add a JWT check immediately after the CORS preflight block, before reading the request body. Follow the pattern from `admin-users/index.ts`: read `Authorization` header → create user-scoped Supabase client → call `getUser()` → 401 on any failure.

No role check beyond "authenticated" — any league member may use OCR.

The file currently starts with `const CORS = {`. The `try` block begins with `const apiKey = Deno.env.get('OPENAI_API_KEY')`.

- [ ] **Step 1: Add Supabase import and auth guard**

```python
path = 'supabase/functions/ocr-scorecard/index.ts'
text = open(path, encoding='utf-8').read()

# Add import at top
assert "const CORS = {" in text
text = text.replace(
    "const CORS = {",
    "import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'\n\nconst CORS = {",
    1
)

# Add auth guard inside try block, before env var check
old_guard = "  try {\n    const apiKey = Deno.env.get('OPENAI_API_KEY')"
new_guard = (
    "  try {\n"
    "    const authHeader = req.headers.get('Authorization')\n"
    "    if (!authHeader) {\n"
    "      return new Response(\n"
    "        JSON.stringify({ error: 'Unauthorized' }),\n"
    "        { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } }\n"
    "      )\n"
    "    }\n"
    "\n"
    "    const supabase = createClient(\n"
    "      Deno.env.get('SUPABASE_URL')!,\n"
    "      Deno.env.get('SUPABASE_ANON_KEY')!,\n"
    "      { global: { headers: { Authorization: authHeader } } }\n"
    "    )\n"
    "    const { data: { user }, error: authError } = await supabase.auth.getUser()\n"
    "    if (authError || !user) {\n"
    "      return new Response(\n"
    "        JSON.stringify({ error: 'Unauthorized' }),\n"
    "        { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } }\n"
    "      )\n"
    "    }\n"
    "\n"
    "    const apiKey = Deno.env.get('OPENAI_API_KEY')"
)
assert old_guard in text, 'try/apiKey pattern not found'
text = text.replace(old_guard, new_guard, 1)

open(path, 'w', encoding='utf-8').write(text)
print('Done')
```

- [ ] **Step 2: Spot-check the result**

```bash
head -5 supabase/functions/ocr-scorecard/index.ts
```

Expected first line: `import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'`

- [ ] **Step 3: Run tests**

```
npm run test
npx playwright test
```

Expected: all pass. (Edge functions are not covered by the unit/E2E suites — manual verification is needed after deploy, but must not break existing tests.)

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/ocr-scorecard/index.ts
git commit -m "fix(security): require auth in ocr-scorecard edge function"
```

---

### Task 4: RLS — Tighten `league_invites` UPDATE policy

**Files:**
- Create: `supabase/migrations/023_tighten_league_invites_rls.sql`

**Context:** Migration `015_league_rls_clean.sql` created policy `"league_invites: accept update"` with `using(true) with check(true)`, allowing any authenticated user to update any invite row directly. The edge function that marks invites accepted uses the service role key (bypasses RLS), so invite acceptance is unaffected by this change. Replace the permissive policy with one restricted to league owners using the existing `is_league_owner(league_id)` function. Note: `is_league_admin` does NOT exist — use `is_league_owner`.

**DO NOT run this migration locally.** It deploys automatically via CI/CD.

- [ ] **Step 1: Create the migration file**

```python
content = """\
-- 023_tighten_league_invites_rls.sql
-- Replaces the blanket league_invites UPDATE policy (using(true)) with one
-- restricted to league owners. The edge function uses service role and bypasses
-- RLS, so invite acceptance (setting accepted_at) is unaffected.

drop policy if exists "league_invites: accept update" on league_invites;

create policy "league_invites: owner update"
  on league_invites for update
  using (is_league_owner(league_id));
"""
open('supabase/migrations/023_tighten_league_invites_rls.sql', 'w', encoding='utf-8').write(content)
print('Done')
```

- [ ] **Step 2: Verify file content**

```bash
cat supabase/migrations/023_tighten_league_invites_rls.sql
```

Expected: matches the SQL above exactly.

- [ ] **Step 3: Run tests**

```
npm run test
npx playwright test
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/023_tighten_league_invites_rls.sql
git commit -m "fix(security): restrict league_invites UPDATE policy to league owners"
```

---

### Task 5: Docs — Dexie convention comment + PLAN.md checkboxes

**Files:**
- Modify: `src/db/local.ts`
- Modify: `PLAN.md`

**Context:** The audit confirmed Dexie v1–v7 are correctly grandfathered (schema-only changes, no data transformation required). v8 correctly adds an `upgrade()` handler. Add a clarifying comment and tick the PLAN.md checkboxes to close Phase 8.

- [ ] **Step 1: Add grandfathering comment to `local.ts`**

```python
path = 'src/db/local.ts'
text = open(path, encoding='utf-8').read()
old = '    // v1 & v2 existed during development — kept so existing browsers can upgrade'
new = (
    '    // v1-v7: schema-only changes with no data transformation — upgrade() handlers not required.\n'
    '    // v8+ must include upgrade() per the convention in PLAN.md.\n'
    '    // v1 & v2 existed during development — kept so existing browsers can upgrade'
)
assert old in text, f'Pattern not found in {path}'
open(path, 'w', encoding='utf-8').write(text.replace(old, new, 1))
print('Done')
```

- [ ] **Step 2: Tick the Dexie convention checkbox in PLAN.md**

```python
path = 'PLAN.md'
text = open(path, encoding='utf-8').read()
old = '- [ ] **Dexie migration convention audit**'
new = '- [x] **Dexie migration convention audit**'
assert old in text, f'Checkbox not found in {path}'
open(path, 'w', encoding='utf-8').write(text.replace(old, new, 1))
print('Done')
```

- [ ] **Step 3: Tick the code review pass checkbox in PLAN.md**

```python
path = 'PLAN.md'
text = open(path, encoding='utf-8').read()
old = '- [ ] **Code review pass**'
new = '- [x] **Code review pass**'
assert old in text, f'Checkbox not found in {path}'
open(path, 'w', encoding='utf-8').write(text.replace(old, new, 1))
print('Done')
```

- [ ] **Step 4: Run tests**

```
npm run test
npx playwright test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/db/local.ts PLAN.md
git commit -m "docs: document Dexie v1-v7 grandfathering and close Phase 8 checkboxes"
```

---

### Task 6: Final verification

- [ ] **Step 1: Full test suite**

```
npm run test
npx playwright test
```

Expected: 169 unit tests pass, 22 E2E tests pass (1 skipped).

- [ ] **Step 2: Confirm Phase 8 is fully closed**

Open `PLAN.md` and verify Phase 8 shows:
```
- [x] **Code review pass**
- [x] **Dexie migration convention audit**
```

---

## Summary

| Task | Files | Commit message |
|------|-------|----------------|
| 1 — GamePage a11y | `GamePage.tsx`, `en/translation.json`, `nl/translation.json` | `fix(a11y): add aria-label to undo and skip buttons in GamePage` |
| 2 — Form labels | `AdminPage.tsx`, `LeagueSettingsPage.tsx` | `fix(a11y): add form labels to AdminPage and LeagueSettingsPage invite inputs` |
| 3 — OCR auth | `ocr-scorecard/index.ts` | `fix(security): require auth in ocr-scorecard edge function` |
| 4 — RLS policy | `023_tighten_league_invites_rls.sql` | `fix(security): restrict league_invites UPDATE policy to league owners` |
| 5 — Docs | `local.ts`, `PLAN.md` | `docs: document Dexie v1-v7 grandfathering and close Phase 8 checkboxes` |
