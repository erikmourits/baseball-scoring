# Change Password & Forgot Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user request a password-reset email, complete that reset via the emailed link, and change their password while already logged in.

**Architecture:** Three independent `supabase-js` Auth calls (`resetPasswordForEmail`, `updateUser`, `signInWithPassword` for re-auth) wired into three UI surfaces: a new `ForgotPasswordForm` reached from `LoginForm`/`AuthPage`, a new `ResetPasswordPage` reached via the emailed link (registered in both the logged-out and authenticated route trees, because Supabase auto-establishes a session before the route renders), and a new `ChangePasswordSection` embedded in `LeagueSettingsPage`. No new Edge Function, no schema change.

**Tech Stack:** React 18 + TypeScript, `@supabase/supabase-js` Auth API, react-i18next, Tailwind, Playwright (local Supabase + Inbucket for real end-to-end email testing), Vitest (type/logic checks only — see note below).

**Spec:** `docs/superpowers/specs/2026-07-26-change-forgot-password-design.md`

## Global Constraints

- **File-write rule (CLAUDE.md):** any file that is or will become >100 lines must be modified via a Python read/replace/write script or a bash heredoc — never the Edit or Write tool. Line counts as of this plan: `src/App.tsx` (103), `supabase/config.toml` (413), `src/pages/LeagueSettingsPage.tsx` (513), `src/locales/en/translation.json` (476), `src/locales/nl/translation.json` (476) all require this. `src/components/auth/LoginForm.tsx` (63), `src/pages/AuthPage.tsx` (50), `src/lib/analytics.ts` (45), `e2e/auth.spec.ts` (20), `e2e/league.spec.ts` (49) stay under 100 lines even after their additions — the normal Edit tool is fine for those.
- **No native dialogs** — any success/failure feedback shown from `LeagueSettingsPage` must go through its existing `showAlert`/`ConfirmDialog` plumbing, never `alert()`/`confirm()`.
- **All user-visible strings via `react-i18next`** — no hardcoded UI copy; every new string is a `t('auth.*')` key added to both `src/locales/en/translation.json` and `src/locales/nl/translation.json`.
- **Password minimum stays 8 characters** — matches `SignupForm.tsx`'s existing `minLength={8}` / `auth.minPassword` convention; no new complexity rules.
- **Never touch production Supabase directly** — `supabase/config.toml` changes in this plan affect only the local/E2E Supabase instance (`supabase start`). The equivalent production change (Dashboard → Authentication → URL Configuration → Redirect URLs) is a manual step flagged in Task 5, not executed by this plan.
- **Before every commit:** run `npm run test` (Vitest) and confirm it passes. Playwright (`npx playwright test`) requires a local Supabase instance (`supabase start`) to be running first — run it per-task where noted, and once more in full during Task 5.
- **No React component test harness exists in this project** (no `@testing-library/react`, no jsdom Vitest environment — the 169 existing Vitest tests are pure business-logic tests like `src/__tests__/baseballLogic.test.ts`). This plan follows the project's actual established convention and verifies all new UI behavior via Playwright E2E, not new Vitest component tests. Vitest is still used in Task 1 to confirm the TypeScript/JSON changes are well-formed.

---

### Task 1: i18n keys and analytics event types

**Files:**
- Modify: `src/locales/en/translation.json` (Python anchor-replace — 476 lines)
- Modify: `src/locales/nl/translation.json` (Python anchor-replace — 476 lines)
- Modify: `src/lib/analytics.ts:3-16` (Edit tool — 45 lines)

**Interfaces:**
- Produces: i18n keys `auth.forgotPassword`, `auth.sendResetLink`, `auth.sendingResetLink`, `auth.resetLinkSent`, `auth.resetLinkSentDetail`, `auth.backToLogin`, `auth.newPassword`, `auth.confirmPassword`, `auth.passwordMismatch`, `auth.resetPassword`, `auth.resettingPassword`, `auth.passwordUpdated`, `auth.invalidResetLink`, `auth.currentPassword`, `auth.changePassword`, `auth.changingPassword`, `auth.passwordChanged` (both locales). Produces `AnalyticsEvent` union members `'auth_password_reset_requested' | 'auth_password_reset_completed' | 'auth_password_changed'`.
- Consumes: nothing new — this is the foundational task all later tasks build on.

This task groups all three flows' copy/types together (rather than splitting across Tasks 2-4) because every addition lands in the same two 476-line JSON files — doing it once avoids repeating the same large-file anchor-patch mechanics three times over.

- [ ] **Step 1: Add English keys**

Run via the Bash tool:

```bash
python3 - <<'PYEOF'
path = 'src/locales/en/translation.json'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old = '''    "checkEmail": "Check your email",
    "confirmationSent": "We sent a confirmation link to {{email}}"
  },'''

new = '''    "checkEmail": "Check your email",
    "confirmationSent": "We sent a confirmation link to {{email}}",
    "forgotPassword": "Forgot password?",
    "sendResetLink": "Send reset link",
    "sendingResetLink": "Sending…",
    "resetLinkSent": "Check your email",
    "resetLinkSentDetail": "If an account exists for {{email}}, we sent a password reset link.",
    "backToLogin": "Back to login",
    "newPassword": "New password",
    "confirmPassword": "Confirm password",
    "passwordMismatch": "Passwords don\'t match",
    "resetPassword": "Reset password",
    "resettingPassword": "Resetting…",
    "passwordUpdated": "Password updated",
    "invalidResetLink": "This reset link is invalid or has expired.",
    "currentPassword": "Current password",
    "changePassword": "Change password",
    "changingPassword": "Changing…",
    "passwordChanged": "Password changed"
  },'''

assert content.count(old) == 1, 'EN anchor not found or not unique'
content = content.replace(old, new)
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('EN translation.json updated')
PYEOF
```

- [ ] **Step 2: Add Dutch keys**

```bash
python3 - <<'PYEOF'
path = 'src/locales/nl/translation.json'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old = '''    "checkEmail": "Controleer je e-mail",
    "confirmationSent": "We hebben een bevestigingslink gestuurd naar {{email}}"
  },'''

new = '''    "checkEmail": "Controleer je e-mail",
    "confirmationSent": "We hebben een bevestigingslink gestuurd naar {{email}}",
    "forgotPassword": "Wachtwoord vergeten?",
    "sendResetLink": "Reset-link versturen",
    "sendingResetLink": "Versturen…",
    "resetLinkSent": "Controleer je e-mail",
    "resetLinkSentDetail": "Als er een account bestaat voor {{email}}, hebben we een reset-link gestuurd.",
    "backToLogin": "Terug naar inloggen",
    "newPassword": "Nieuw wachtwoord",
    "confirmPassword": "Bevestig wachtwoord",
    "passwordMismatch": "Wachtwoorden komen niet overeen",
    "resetPassword": "Wachtwoord opnieuw instellen",
    "resettingPassword": "Bezig met opnieuw instellen…",
    "passwordUpdated": "Wachtwoord bijgewerkt",
    "invalidResetLink": "Deze reset-link is ongeldig of verlopen.",
    "currentPassword": "Huidig wachtwoord",
    "changePassword": "Wachtwoord wijzigen",
    "changingPassword": "Bezig met wijzigen…",
    "passwordChanged": "Wachtwoord gewijzigd"
  },'''

assert content.count(old) == 1, 'NL anchor not found or not unique'
content = content.replace(old, new)
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('NL translation.json updated')
PYEOF
```

- [ ] **Step 3: Verify both JSON files still parse**

```bash
node -e "JSON.parse(require('fs').readFileSync('src/locales/en/translation.json','utf8')); JSON.parse(require('fs').readFileSync('src/locales/nl/translation.json','utf8')); console.log('both valid')"
```

Expected: `both valid`. If it throws, the anchor replace produced malformed JSON — fix before continuing.

- [ ] **Step 4: Add analytics event types**

Use the Edit tool on `src/lib/analytics.ts`:

old_string:
```ts
  | 'auth_login'
  | 'auth_logout'
  | 'game_created'
```

new_string:
```ts
  | 'auth_login'
  | 'auth_logout'
  | 'auth_password_reset_requested'
  | 'auth_password_reset_completed'
  | 'auth_password_changed'
  | 'game_created'
```

- [ ] **Step 5: Type-check and run the unit suite**

```bash
npx tsc --noEmit
npm run test
```

Expected: both succeed (this task adds no new components, so no test count changes).

- [ ] **Step 6: Commit**

```bash
git add src/locales/en/translation.json src/locales/nl/translation.json src/lib/analytics.ts
git commit -m "$(cat <<'EOF'
feat: add i18n keys and analytics events for password flows

Foundational copy/types for the upcoming forgot-password,
reset-password, and change-password features.
EOF
)"
```

---

### Task 2: Forgot-password request flow

**Files:**
- Create: `src/components/auth/ForgotPasswordForm.tsx`
- Modify: `src/components/auth/LoginForm.tsx` (Edit tool — 63 lines)
- Modify: `src/pages/AuthPage.tsx` (Edit tool — 50 lines)
- Test: `e2e/auth.spec.ts` (Edit tool — 20 lines)

**Interfaces:**
- Consumes: i18n keys from Task 1 (`auth.forgotPassword`, `auth.sendResetLink`, `auth.sendingResetLink`, `auth.resetLinkSent`, `auth.resetLinkSentDetail`, `auth.backToLogin`), `analytics.track('auth_password_reset_requested')` from Task 1.
- Produces: `ForgotPasswordForm({ onBack: () => void })` default export. `LoginForm({ onForgotPassword: () => void })` — its prop signature changes, so its one call site (`AuthPage.tsx`) must be updated in this same task.

- [ ] **Step 1: Create `ForgotPasswordForm.tsx`**

```bash
cat > src/components/auth/ForgotPasswordForm.tsx <<'EOF'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { analytics } from '../../lib/analytics'

interface Props {
  onBack: () => void
}

export default function ForgotPasswordForm({ onBack }: Props) {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) {
      setError(error.message)
    } else {
      analytics.track('auth_password_reset_requested')
      setDone(true)
    }
    setLoading(false)
  }

  if (done) {
    return (
      <div className="text-center py-4">
        <div className="text-3xl mb-2">📬</div>
        <p className="font-medium text-gray-900 dark:text-gray-100">{t('auth.resetLinkSent')}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('auth.resetLinkSentDetail', { email })}</p>
        <button
          onClick={onBack}
          className="mt-4 text-sm text-brand-500 dark:text-brand-100 hover:text-brand-700 dark:hover:text-brand-100"
        >
          {t('auth.backToLogin')}
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.email')}</label>
        <input
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          placeholder={t('auth.emailPlaceholder')}
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-brand-500 text-white font-medium py-2.5 rounded-lg hover:bg-brand-600 active:bg-brand-700 transition-colors disabled:opacity-50"
      >
        {loading ? t('auth.sendingResetLink') : t('auth.sendResetLink')}
      </button>
      <button
        type="button"
        onClick={onBack}
        className="w-full text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
      >
        {t('auth.backToLogin')}
      </button>
    </form>
  )
}
EOF
```

- [ ] **Step 2: Add the "Forgot password?" link to `LoginForm.tsx`**

Use the Edit tool, two separate replacements:

old_string:
```tsx
export default function LoginForm() {
```
new_string:
```tsx
interface Props {
  onForgotPassword: () => void
}

export default function LoginForm({ onForgotPassword }: Props) {
```

old_string:
```tsx
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.password')}</label>
        <input
          type="password"
          required
          value={password}
```
new_string:
```tsx
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('common.password')}</label>
          <button
            type="button"
            onClick={onForgotPassword}
            className="text-xs text-brand-500 dark:text-brand-100 hover:text-brand-700 dark:hover:text-brand-100"
          >
            {t('auth.forgotPassword')}
          </button>
        </div>
        <input
          type="password"
          required
          value={password}
```

- [ ] **Step 3: Wire the new mode into `AuthPage.tsx`**

Use the Edit tool, two separate replacements:

old_string:
```tsx
import SignupForm from '../components/auth/SignupForm'

export default function AuthPage() {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
```
new_string:
```tsx
import SignupForm from '../components/auth/SignupForm'
import ForgotPasswordForm from '../components/auth/ForgotPasswordForm'

export default function AuthPage() {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login')
```

old_string:
```tsx
        <div className="flex rounded-lg bg-gray-100 p-1 mb-6">
          <button
            onClick={() => setMode('login')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
              mode === 'login'
                ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            {t('auth.login')}
          </button>
          <button
            onClick={() => setMode('signup')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
              mode === 'signup'
                ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            {t('auth.signup')}
          </button>
        </div>

        {mode === 'login' ? <LoginForm /> : <SignupForm onSuccess={() => setMode('login')} />}
```
new_string:
```tsx
        {mode !== 'forgot' && (
          <div className="flex rounded-lg bg-gray-100 p-1 mb-6">
            <button
              onClick={() => setMode('login')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                mode === 'login'
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
              }`}
            >
              {t('auth.login')}
            </button>
            <button
              onClick={() => setMode('signup')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                mode === 'signup'
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
              }`}
            >
              {t('auth.signup')}
            </button>
          </div>
        )}

        {mode === 'login' && <LoginForm onForgotPassword={() => setMode('forgot')} />}
        {mode === 'signup' && <SignupForm onSuccess={() => setMode('login')} />}
        {mode === 'forgot' && <ForgotPasswordForm onBack={() => setMode('login')} />}
```

- [ ] **Step 4: Add an E2E test**

Use the Edit tool to append to `e2e/auth.spec.ts` (old_string is the file's last two lines, new_string repeats them with the new block before the final blank line):

old_string:
```ts
    await expect(page.locator('nav')).toBeVisible()
  })

})
```
new_string:
```ts
    await expect(page.locator('nav')).toBeVisible()
  })

})

test.describe('Forgot password', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('shows a confirmation after requesting a reset link', async ({ page }) => {
    await page.goto('/auth')
    await page.getByRole('button', { name: /forgot password|wachtwoord vergeten/i }).click()
    await page.locator('input[type="email"]').fill('e2e-nonexistent-user@example.com')
    await page.getByRole('button', { name: /send reset link|reset-link versturen/i }).click()
    await expect(page.getByText(/check your email|controleer je e-mail/i)).toBeVisible({ timeout: 10_000 })
  })
})
```

`test.use({ storageState: { cookies: [], origins: [] } })` overrides the project-level authenticated storage state for this describe block only, so the test starts logged out (needed to reach `/auth` at all — the `chromium` project in `playwright.config.ts` is authenticated by default).

- [ ] **Step 5: Run the new test**

Requires a local Supabase instance:

```bash
supabase start
npx playwright test e2e/auth.spec.ts
```

Expected: all tests in the file pass, including the new "Forgot password" describe block.

- [ ] **Step 6: Run the unit suite too**

```bash
npm run test
```

Expected: still 169 passing (no unit tests touch this code path, per the Global Constraints note).

- [ ] **Step 7: Commit**

```bash
git add src/components/auth/ForgotPasswordForm.tsx src/components/auth/LoginForm.tsx src/pages/AuthPage.tsx e2e/auth.spec.ts
git commit -m "$(cat <<'EOF'
feat: add forgot-password request flow

Adds a "Forgot password?" link on the login form that requests a
Supabase password-reset email via resetPasswordForEmail, reusing the
existing reset-password.html Dashboard template.
EOF
)"
```

---

### Task 3: Reset-password completion flow

**Files:**
- Create: `src/pages/ResetPasswordPage.tsx`
- Modify: `src/App.tsx` (Python anchor-replace — 103 lines)
- Modify: `supabase/config.toml` (Python anchor-replace — 413 lines)
- Test: `e2e/auth.spec.ts` (Edit tool)

**Interfaces:**
- Consumes: i18n keys from Task 1 (`auth.newPassword`, `auth.confirmPassword`, `auth.passwordMismatch`, `auth.resetPassword`, `auth.resettingPassword`, `auth.passwordUpdated`, `auth.invalidResetLink`, `auth.backToLogin`, `auth.minPassword`, `auth.appName`), `analytics.track('auth_password_reset_completed')` from Task 1, `useSession()` from `src/hooks/useSession.ts` (unchanged).
- Produces: `ResetPasswordPage` default export, registered at route `/reset-password` in two places in `App.tsx`.

- [ ] **Step 1: Create `ResetPasswordPage.tsx`**

```bash
cat > src/pages/ResetPasswordPage.tsx <<'EOF'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { analytics } from '../lib/analytics'
import { useSession } from '../hooks/useSession'
import LanguageToggle from '../components/LanguageToggle'

export default function ResetPasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { session, loading: sessionLoading } = useSession()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch'))
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
    } else {
      analytics.track('auth_password_reset_completed')
      setDone(true)
      setTimeout(() => navigate('/'), 2000)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-brand-500 px-4">
      <div className="mb-8 text-center">
        <div className="text-6xl mb-3">⚾</div>
        <h1 className="text-3xl font-bold text-white">{t('auth.appName')}</h1>
      </div>

      <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
        <div className="flex justify-end mb-2">
          <LanguageToggle />
        </div>

        {sessionLoading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">{t('common.loading')}</p>
        ) : !session ? (
          <div className="text-center py-4">
            <p className="text-sm text-gray-700 dark:text-gray-300">{t('auth.invalidResetLink')}</p>
            <button
              onClick={() => navigate('/auth')}
              className="mt-4 text-sm text-brand-500 dark:text-brand-100 hover:text-brand-700 dark:hover:text-brand-100"
            >
              {t('auth.backToLogin')}
            </button>
          </div>
        ) : done ? (
          <div className="text-center py-4">
            <div className="text-3xl mb-2">✅</div>
            <p className="font-medium text-gray-900 dark:text-gray-100">{t('auth.passwordUpdated')}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('auth.newPassword')}</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                placeholder={t('auth.minPassword')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('auth.confirmPassword')}</label>
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                placeholder={t('auth.minPassword')}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-500 text-white font-medium py-2.5 rounded-lg hover:bg-brand-600 active:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {loading ? t('auth.resettingPassword') : t('auth.resetPassword')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
EOF
```

- [ ] **Step 2: Register the route in `App.tsx`**

```bash
python3 - <<'PYEOF'
path = 'src/App.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

replacements = [
    (
        "import SignupInvitePage from './pages/SignupInvitePage'\nimport HelpPage from './pages/HelpPage'",
        "import SignupInvitePage from './pages/SignupInvitePage'\nimport HelpPage from './pages/HelpPage'\nimport ResetPasswordPage from './pages/ResetPasswordPage'",
    ),
    (
        "      <Routes>\n        <Route element={<AppShell />}>",
        "      <Routes>\n        <Route path=\"/reset-password\" element={<ResetPasswordPage />} />\n        <Route element={<AppShell />}>",
    ),
    (
        '          <Route path="/auth"          element={<AuthPage />} />\n          <Route path="/watch/:token"         element={<WatchPage />} />',
        '          <Route path="/auth"          element={<AuthPage />} />\n          <Route path="/reset-password" element={<ResetPasswordPage />} />\n          <Route path="/watch/:token"         element={<WatchPage />} />',
    ),
]

for old, new in replacements:
    assert content.count(old) == 1, f'anchor not found or not unique: {old[:50]!r}'
    content = content.replace(old, new)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('App.tsx updated')
PYEOF
```

This registers `/reset-password` twice: once as a standalone route (outside the `<AppShell>` group) inside `AuthenticatedApp`'s `<Routes>` — the branch that actually fires, since Supabase's client auto-establishes a session from the recovery link's URL tokens before the router ever renders — and once in the logged-out `<Routes>` block, for correctness if no session gets established.

- [ ] **Step 3: Allow the redirect URL in local Supabase config**

```bash
python3 - <<'PYEOF'
path = 'supabase/config.toml'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old = 'additional_redirect_urls = ["http://127.0.0.1:5173", "http://localhost:5173"]'
new = 'additional_redirect_urls = ["http://127.0.0.1:5173/**", "http://localhost:5173/**"]'

assert content.count(old) == 1, 'redirect URL anchor not found or not unique'
content = content.replace(old, new)
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('config.toml updated')
PYEOF
```

Without this, Supabase's GoTrue rejects `redirectTo: '.../reset-password'` as outside the allow-list (the existing entries only allow-list the bare origin, not sub-paths) and silently falls back to redirecting to `site_url` instead — the recovery tokens would still land in the browser, but on the wrong page, so `ResetPasswordPage` would never render. This only affects the **local** Supabase instance started via `supabase start`; production has its own separate Dashboard-configured allow-list (see Task 5).

- [ ] **Step 4: Restart local Supabase to pick up the config change**

```bash
supabase stop
supabase start
```

- [ ] **Step 5: Add an E2E test that drives the real reset email via Inbucket**

Use the Edit tool to append to `e2e/auth.spec.ts` (append after the `Forgot password` describe block added in Task 2):

old_string (the closing of the `Forgot password` block added in Task 2):
```ts
    await expect(page.getByText(/check your email|controleer je e-mail/i)).toBeVisible({ timeout: 10_000 })
  })
})
```
new_string:
```ts
    await expect(page.getByText(/check your email|controleer je e-mail/i)).toBeVisible({ timeout: 10_000 })
  })
})

async function fetchLatestResetLink(email: string): Promise<string> {
  const inbucketUrl = process.env.E2E_INBUCKET_URL ?? 'http://127.0.0.1:54324'
  const mailbox = email.split('@')[0].toLowerCase()

  let messages: any[] = []
  for (let attempt = 0; attempt < 10 && messages.length === 0; attempt++) {
    const listRes = await fetch(`${inbucketUrl}/api/v1/mailbox/${mailbox}`)
    messages = await listRes.json()
    if (messages.length === 0) await new Promise(r => setTimeout(r, 1000))
  }
  if (messages.length === 0) throw new Error(`No email arrived for ${mailbox} in Inbucket`)

  const latest = messages[messages.length - 1]
  const msgRes = await fetch(`${inbucketUrl}/api/v1/mailbox/${mailbox}/${latest.id}`)
  const message = await msgRes.json()
  const match = (message.body?.html ?? '').match(/href="([^"]+)"/)
  if (!match) throw new Error('No link found in reset password email body')
  return match[1].replace(/&amp;/g, '&')
}

test.describe('Reset password', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('completes the reset flow via the emailed link', async ({ page }) => {
    const email = process.env.E2E_EMAIL!
    const password = process.env.E2E_PASSWORD!

    await page.goto('/auth')
    await page.getByRole('button', { name: /forgot password|wachtwoord vergeten/i }).click()
    await page.locator('input[type="email"]').fill(email)
    await page.getByRole('button', { name: /send reset link|reset-link versturen/i }).click()
    await expect(page.getByText(/check your email|controleer je e-mail/i)).toBeVisible({ timeout: 10_000 })

    const link = await fetchLatestResetLink(email)
    await page.goto(link)
    await page.waitForURL(/\/reset-password/, { timeout: 15_000 })

    // Reset to the same password the fixture account already uses, so
    // auth.setup.ts keeps working for every other spec in this suite.
    await page.locator('input[type="password"]').nth(0).fill(password)
    await page.locator('input[type="password"]').nth(1).fill(password)
    await page.getByRole('button', { name: /reset password|wachtwoord opnieuw instellen/i }).click()

    await page.waitForURL('/', { timeout: 15_000 })
    await expect(page.locator('nav')).toBeVisible()
  })
})
```

This uses local Supabase's bundled Inbucket mail catcher (enabled in `supabase/config.toml`'s `[inbucket]` section, port 54324) to fetch the real email and extract the real reset link — a genuine end-to-end test, not a stub. It deliberately resets the password to its own existing value rather than a new one, so no cleanup/restore step is needed for other tests in the suite.

- [ ] **Step 6: Run the new test**

```bash
npx playwright test e2e/auth.spec.ts
```

Expected: all tests pass, including "completes the reset flow via the emailed link". If it fails at the Inbucket fetch step, confirm `supabase start` is running and `supabase status` shows Inbucket on port 54324.

- [ ] **Step 7: Run the unit suite too**

```bash
npm run test
```

- [ ] **Step 8: Commit**

```bash
git add src/pages/ResetPasswordPage.tsx src/App.tsx supabase/config.toml e2e/auth.spec.ts
git commit -m "$(cat <<'EOF'
feat: add reset-password completion page

Registers /reset-password in both route trees since Supabase
establishes a session from the recovery link before routing occurs,
and widens the local redirect-URL allow-list to permit the new path.
EOF
)"
```

---

### Task 4: Change password (logged-in users)

**Files:**
- Modify: `src/pages/LeagueSettingsPage.tsx` (Python anchor-replace — 513 lines)
- Test: `e2e/league.spec.ts` (Edit tool — 49 lines)

**Interfaces:**
- Consumes: i18n keys from Task 1 (`auth.currentPassword`, `auth.newPassword`, `auth.confirmPassword`, `auth.passwordMismatch`, `auth.changePassword`, `auth.changingPassword`, `auth.passwordChanged`), `analytics.track('auth_password_changed')` from Task 1, the page's existing `supabase`, `analytics`, `useTranslation`, `useState` imports (already present — no new imports needed), and the page's existing `showAlert(message, title)` helper.
- Produces: a `ChangePasswordSection` component (local to this file, same pattern as the existing `MemberRow` component), rendered in both of `LeagueSettingsPage`'s render branches.


- [ ] **Step 1: Insert `ChangePasswordSection` and wire it into both render branches**

Run this single Python script via the Bash tool (it defines the new component, then applies three anchored replacements, then writes the file back once):

```bash
python3 - <<'PYEOF'
path = 'src/pages/LeagueSettingsPage.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

component = '''// ── Change password ───────────────────────────────────────────────────────────

function ChangePasswordSection({
  email,
  onSuccess,
  onError,
}: {
  email: string
  onSuccess: (message: string) => void
  onError: (message: string) => void
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (newPassword !== confirmPassword) {
      setError(t('auth.passwordMismatch'))
      return
    }
    setLoading(true)
    const { error: reauthError } = await supabase.auth.signInWithPassword({ email, password: currentPassword })
    if (reauthError) {
      setError(reauthError.message)
      setLoading(false)
      return
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    setLoading(false)
    if (updateError) {
      onError(t('league.failed', { error: updateError.message }))
      return
    }
    analytics.track('auth_password_changed')
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setExpanded(false)
    onSuccess(t('auth.passwordChanged'))
  }

  function cancel() {
    setExpanded(false)
    setError('')
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full text-left px-3 py-2.5 rounded-xl text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        {t('auth.changePassword')}
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 px-3 py-2.5">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>
      )}
      <input
        type="password"
        required
        value={currentPassword}
        onChange={e => setCurrentPassword(e.target.value)}
        placeholder={t('auth.currentPassword')}
        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
      />
      <input
        type="password"
        required
        minLength={8}
        value={newPassword}
        onChange={e => setNewPassword(e.target.value)}
        placeholder={t('auth.newPassword')}
        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
      />
      <input
        type="password"
        required
        minLength={8}
        value={confirmPassword}
        onChange={e => setConfirmPassword(e.target.value)}
        placeholder={t('auth.confirmPassword')}
        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {loading ? t('auth.changingPassword') : t('auth.changePassword')}
        </button>
        <button type="button" onClick={cancel} className="text-sm text-gray-400 dark:text-gray-500 px-2">
          {t('common.cancel')}
        </button>
      </div>
    </form>
  )
}

'''

replacements = [
    (
        '// ── Main page ─────────────────────────────────────────────────────────────────\n\nexport default function LeagueSettingsPage() {',
        component + '// ── Main page ─────────────────────────────────────────────────────────────────\n\nexport default function LeagueSettingsPage() {',
    ),
    (
        '''        <div className="mt-10 pt-6 border-t border-gray-200 dark:border-gray-700">
          <button onClick={signOut} className="text-sm text-red-500 dark:text-red-400">{t('league.signOut')}</button>
        </div>
      </div>
    )
  }''',
        '''        <div className="mt-10 pt-6 border-t border-gray-200 dark:border-gray-700 space-y-1">
          <ChangePasswordSection
            email={session!.user.email!}
            onSuccess={msg => showAlert(msg, t('league.done'))}
            onError={msg => showAlert(msg, t('league.error'))}
          />
          <button onClick={signOut} className="text-sm text-red-500 dark:text-red-400">{t('league.signOut')}</button>
        </div>
      </div>
    )
  }''',
    ),
    (
        '''        >
          {clearing ? t('league.clearing') : t('league.clearData')}
        </button>
      </div>

      {/* App version */}''',
        '''        >
          {clearing ? t('league.clearing') : t('league.clearData')}
        </button>
      </div>

      {/* Account */}
      <div className="pt-4 mt-2 border-t border-gray-100 dark:border-gray-700">
        <ChangePasswordSection
          email={session!.user.email!}
          onSuccess={msg => showAlert(msg, t('league.done'))}
          onError={msg => showAlert(msg, t('league.error'))}
        />
      </div>

      {/* App version */}''',
    ),
]

for old, new in replacements:
    assert content.count(old) == 1, f'anchor not found or not unique: {old[:60]!r}'
    content = content.replace(old, new)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('LeagueSettingsPage.tsx updated')
PYEOF
```

Note on placement: the spec called for putting this "directly above sign-out" uniformly, but the file's two render branches already place sign-out differently — a bordered bottom block in the "no league yet" view (where the new section slots in directly above it, as specced), versus inline in the compact top header row in the "league exists" view (where a form-sized section doesn't fit). For the latter, this adds a new bottom "Account" section instead, grouped with the other bottom sections (Help, Troubleshooting) rather than jammed into the header row.

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Add E2E tests**

Use the Edit tool to append to `e2e/league.spec.ts`:

old_string:
```ts
    // Restore to NL so other tests are unaffected
    const currentLang = await langToggle.textContent()
    if (currentLang?.trim() !== 'NL') await langToggle.click()
  })
})
```
new_string:
```ts
    // Restore to NL so other tests are unaffected
    const currentLang = await langToggle.textContent()
    if (currentLang?.trim() !== 'NL') await langToggle.click()
  })

  test('rejects an incorrect current password', async ({ page }) => {
    await page.goto('/league')
    await page.getByRole('button', { name: /change password|wachtwoord wijzigen/i }).first().click()

    const passwordInputs = page.locator('form input[type="password"]')
    await passwordInputs.nth(0).fill('definitely-the-wrong-password')
    await passwordInputs.nth(1).fill('some-new-password-123')
    await passwordInputs.nth(2).fill('some-new-password-123')
    await page.getByRole('button', { name: /change password|wachtwoord wijzigen/i }).click()

    await expect(page.locator('form .bg-red-50')).toBeVisible({ timeout: 10_000 })
  })

  test('changes the password when the current password is correct', async ({ page }) => {
    const password = process.env.E2E_PASSWORD!

    await page.goto('/league')
    await page.getByRole('button', { name: /change password|wachtwoord wijzigen/i }).first().click()

    const passwordInputs = page.locator('form input[type="password"]')
    await passwordInputs.nth(0).fill(password)
    await passwordInputs.nth(1).fill(password)
    await passwordInputs.nth(2).fill(password)
    await page.getByRole('button', { name: /change password|wachtwoord wijzigen/i }).click()

    // Success is reported via the app's ConfirmDialog (alertOnly)
    await expect(page.getByText(/password changed|wachtwoord gewijzigd/i)).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: /^ok$/i }).click()
  })
})
```

This test resets the fixture account's password to its own current value (`process.env.E2E_PASSWORD`), matching the same no-cleanup-needed approach used in Task 3.

- [ ] **Step 4: Run the new tests**

```bash
npx playwright test e2e/league.spec.ts
```

Expected: all tests pass, including the two new ones.

- [ ] **Step 5: Run the unit suite too**

```bash
npm run test
```

- [ ] **Step 6: Commit**

```bash
git add src/pages/LeagueSettingsPage.tsx e2e/league.spec.ts
git commit -m "$(cat <<'EOF'
feat: add change-password section to league settings

Re-verifies the current password via signInWithPassword before
calling updateUser, so a hijacked logged-in session alone can't
lock out the real account owner.
EOF
)"
```

---

### Task 5: Full regression and production follow-up

**Files:** none (verification only).

- [ ] **Step 1: Full build check**

```bash
npm run build
```

Expected: succeeds (runs `tsc && vite build`).

- [ ] **Step 2: Full unit suite**

```bash
npm run test
```

Expected: all passing (169 + this feature added no new Vitest tests, per the Global Constraints note).

- [ ] **Step 3: Full E2E suite**

```bash
supabase start
npx playwright test
```

Expected: all specs pass, including every test added in Tasks 2-4.

- [ ] **Step 4: Flag the required production step (do not perform without explicit confirmation)**

Two manual, production-affecting Supabase Dashboard steps are required before this feature works in production — surface both to the user and wait for confirmation before either is done:

1. **Auth → URL Configuration → Redirect URLs**: add `https://baseball.mourits.nu/reset-password` (or a wildcard `https://baseball.mourits.nu/**`) to the allow-list. Without this, production's `resetPasswordForEmail` redirect falls back to the site URL instead of `/reset-password`, the same failure mode described in Task 3 Step 3 but in production.
2. **Auth → Templates → Reset Password**: confirm `docs/supabase-email-templates/reset-password.html` has actually been pasted in (per `docs/supabase-email-templates/README.md`, its Dashboard-applied status was never confirmed when the template was authored).

- [ ] **Step 5: No commit needed**

This task is verification-only; only commit if Step 1-3 surfaced a fix that was applied in response.
