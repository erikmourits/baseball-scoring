# Design: Change Password & Forgot Password

**Date:** 2026-07-26
**Status:** Approved

## Problem

The app has no way for a user to change their password once logged in, and no way to recover
access if they forget it. `src/components/auth/LoginForm.tsx` and `SignupForm.tsx` cover
sign-in and sign-up only. `src/pages/LeagueSettingsPage.tsx` (the de facto account-settings
page — it already hosts sign-out, dark mode, and language toggle) has no password section.

The email side is already prepared: `docs/supabase-email-templates/reset-password.html`
(see `[[project_smtp_resend_setup]]`) is a ready-to-paste, EN/NL-localized Supabase "Reset
Password" Dashboard template, keyed off `user_metadata.lang` the same way signup confirmation
already works (stamped at signup by `SignupForm.tsx` / `InvitePage.tsx`). What's missing is
entirely front-end: the UI to request a reset, the page that lands after the emailed link, and
a change-password form for logged-in users.

## Solution

Three independent pieces, all client-side calls against `supabase-js`'s existing Auth API — no
new Edge Function, no new secret, no new Supabase configuration beyond what's already documented:

1. **Forgot password** — a "Forgot password?" link on the login form triggers
   `supabase.auth.resetPasswordForEmail(email, { redirectTo })`, which sends the already-templated
   email.
2. **Reset password** — a new page the emailed link lands on, which calls
   `supabase.auth.updateUser({ password })` against the recovery session Supabase establishes
   automatically when the link is clicked.
3. **Change password** — a form in `LeagueSettingsPage.tsx` for already-logged-in users, which
   re-verifies the current password via `signInWithPassword` before calling `updateUser({ password })`.

## Architecture

```
Forgot password:
  LoginForm "Forgot password?" link
        │
        ▼
  AuthPage mode = 'forgot' → ForgotPasswordForm (email only)
        │
        ▼
  supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/reset-password` })
        │
        ▼
  Supabase sends "Reset Password" templated email (existing Resend SMTP, existing template)
        │
        ▼
  User clicks link → browser opens /reset-password?<recovery tokens>
        │
        ▼
  supabase-js auto-detects tokens in URL, establishes a session, fires
  onAuthStateChange (session now non-null)
        │
        ▼
  useSession() picks up the session → App.tsx renders AuthenticatedApp
        │
        ▼
  ResetPasswordPage (registered inside AuthenticatedApp, standalone — not under AppShell)
        │
        ▼
  supabase.auth.updateUser({ password }) → navigate('/')

Change password (already logged in):
  LeagueSettingsPage "Change password" section
        │
        ▼
  supabase.auth.signInWithPassword({ email: session.user.email, password: currentPassword })
        │  (re-verify identity; fail → inline error, stop)
        ▼
  supabase.auth.updateUser({ password: newPassword }) → showAlert(success/error)
```

The key architectural wrinkle: **Supabase establishes a real session as soon as the recovery
link is opened**, before the app's router ever sees the URL. `App.tsx` gates its entire route
tree on `useSession()`, so `/reset-password` must be reachable from the *authenticated* branch,
not just the logged-out one. This mirrors the existing dual-registration pattern already used
for `/watch/:token` and `/league-invite/:token` (present in both the logged-out `<Routes>` and
inside `AuthenticatedApp`'s `<Routes>`).

## Components

### `src/components/auth/LoginForm.tsx`
- Add a `"Forgot password?"` button/link below the password field. Calls a new `onForgotPassword`
  prop (passed down from `AuthPage`) instead of owning navigation itself, keeping `LoginForm`
  free of routing/mode concerns — consistent with how it doesn't know about `SignupForm` today.

### `src/pages/AuthPage.tsx`
- Extend `mode` state: `'login' | 'signup' | 'forgot'`.
- Render `<ForgotPasswordForm onBack={() => setMode('login')} />` when `mode === 'forgot'`.
- The tab row (Login/Signup buttons) is hidden while `mode === 'forgot'` — it's a sub-view of
  login, not a third tab.

### `src/components/auth/ForgotPasswordForm.tsx` (new)
- Same visual pattern as `SignupForm`/`LoginForm`: `space-y-4` form, shared input/error/button
  classes.
- Single email field. On submit: `setLoading(true)`, call
  `supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })`,
  then show a "done" state (same shape as `SignupForm`'s post-signup state: emoji + bold message
  + gray sub-text with the entered email) regardless of whether the address exists — Supabase
  does not reveal account existence through this call, so there's nothing to branch on and no
  enumeration risk to introduce.
- A "back to login" link/button always visible, calling `onBack`.
- `analytics.track('auth_password_reset_requested')` on successful call (mirrors
  `auth_login` in `LoginForm.tsx`).

### `src/pages/ResetPasswordPage.tsx` (new)
- Uses `useSession()` to read the recovery session already established by the time this page
  mounts.
- **No session** (expired/invalid/already-used link, or direct navigation without a token):
  render an error state — message + link back to `/auth`. Do not render the form.
- **Session present**: render new-password + confirm-password fields (`type="password"`,
  `minLength={8}`, matching the existing `auth.minPassword` convention from `SignupForm`).
  Client-side check that both fields match before submitting (inline error if not, no network
  call).
- On submit: `supabase.auth.updateUser({ password })`. Error → inline error banner (same style
  as other auth forms). Success → brief confirmation message, then `navigate('/')` after a short
  delay (same "flash success, then move on" shape used elsewhere, e.g. `league.refreshed` in
  `LeagueSettingsPage`) — no need to force a fresh login, the recovery session is already a
  valid authenticated session.
- `analytics.track('auth_password_reset_completed')` on success.
- Same outer layout as `AuthPage`/`SignupInvitePage`: centered `bg-brand-500` full-screen wrapper,
  white/gray-800 rounded card, `⚾` header.

### `src/App.tsx`
- Add `<Route path="/reset-password" element={<ResetPasswordPage />} />` to the logged-out
  `<Routes>` block (line ~94), for correctness/direct testing even though the recovery-session
  redirect means this branch won't normally be hit.
- Add the same route as a **standalone sibling** inside `AuthenticatedApp`'s `<Routes>` — i.e.
  a `<Route path="/reset-password" element={<ResetPasswordPage />} />` outside the
  `<Route element={<AppShell />}>` group, so it renders without app nav chrome (this is the path
  that actually fires in practice).

### `src/pages/LeagueSettingsPage.tsx`
- New collapsed-by-default "Change password" section, placed directly above the existing
  sign-out button (same `border-t` divider block) — visually grouped as "account" actions,
  change-password first since sign-out is the more destructive/terminal action of the two.
- Collapsed state: a single button ("Change password") that reveals the form inline; no new
  route.
- Form fields: current password, new password, confirm new password (all `type="password"`,
  `minLength={8}` on the new-password field). Client-side check new/confirm match before any
  network call.
- Submit handler:
  1. `supabase.auth.signInWithPassword({ email: session.user.email!, password: currentPassword })`
     — re-verifies identity. On error, inline error ("current password incorrect" — reuse
     Supabase's own error message like `LoginForm` does, no need to translate/remap it).
  2. On success, `supabase.auth.updateUser({ password: newPassword })`. Report outcome via the
     page's existing `showAlert(message, title)` dialog helper (same helper used by
     `handleClearAndResync`), success or failure. On success, collapse the form and clear all
     three fields.
- `analytics.track('auth_password_changed')` on success.

## Data Flow / Session Handling

- `resetPasswordForEmail` and `updateUser` are plain `supabase-js` Auth calls — no new database
  tables, no RLS changes, no Edge Function.
- The recovery-link session Supabase establishes on `/reset-password` is a full session (same
  shape as a normal login), which is why `ResetPasswordPage` can rely on `useSession()` rather
  than parsing URL tokens itself — `supabase-js`'s default `detectSessionInUrl: true` already
  did that before the component mounted.
- No change to `useSession.ts` — it doesn't need to distinguish the `PASSWORD_RECOVERY` auth
  event type from a normal `SIGNED_IN` one, since both result in a valid `session` and
  `ResetPasswordPage`'s own logic (not `useSession`) decides what to render.

## Error Handling

- All three forms surface Supabase's raw `error.message` in the existing red inline-banner style
  (`bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 ...`) — same convention as
  `LoginForm`/`SignupForm`, no new error-mapping layer.
- `ForgotPasswordForm` never surfaces "no such account" — Supabase's API doesn't return that
  distinction for this call, so the UI can't leak it even by accident.
- `ResetPasswordPage`'s "no session" guard is the only new error *state* (as opposed to
  transient error message): distinguishes "your link is invalid/expired" from a normal form
  error, since there's no form to retry in that case.
- Change-password's re-verification step means a wrong *current* password never reaches
  `updateUser` at all — the only way to change the password is to prove you know the existing one.

## i18n

New keys added to the existing `auth` namespace in both `src/locales/en/translation.json` and
`src/locales/nl/translation.json` (parallel structure, matching every other key in that
namespace):

```
auth.forgotPassword          "Forgot password?"
auth.sendResetLink           "Send reset link"
auth.sendingResetLink        "Sending…"
auth.resetLinkSent           "Check your email"
auth.resetLinkSentDetail     "If an account exists for {{email}}, we sent a password reset link."
auth.backToLogin             "Back to login"
auth.newPassword             "New password"
auth.confirmPassword         "Confirm password"
auth.passwordMismatch        "Passwords don't match"
auth.resetPassword           "Reset password"
auth.resettingPassword       "Resetting…"
auth.passwordUpdated         "Password updated"
auth.invalidResetLink        "This reset link is invalid or has expired."
auth.currentPassword         "Current password"
auth.changePassword          "Change password"
auth.changingPassword        "Changing…"
auth.passwordChanged         "Password changed"
```

Note: `resetLinkSentDetail` deliberately says "if an account exists for..." rather than
confirming the email was sent, to match `resetPasswordForEmail`'s no-enumeration behavior at the
copy level too (see Error Handling above).

`LeagueSettingsPage.tsx`'s change-password section uses these same `auth.*` keys rather than
introducing `league.changePassword`-style duplicates, since the vocabulary (password, confirm
password, etc.) is identical across all three flows.

## Testing

- **Vitest unit tests** for:
  - `ForgotPasswordForm`: submits → calls `resetPasswordForEmail` with the right `redirectTo` →
    shows the done state.
  - `ResetPasswordPage`: no-session → error state; session + mismatched passwords → inline
    error, no network call; session + matching passwords → calls `updateUser`, navigates on
    success.
  - `LeagueSettingsPage` change-password section: wrong current password → inline error,
    `updateUser` never called; correct current password → `updateUser` called, `showAlert`
    invoked, form collapses.
- **Playwright E2E**: extend the existing auth-flow spec with a case that opens the "Forgot
  password?" link and confirms the request-sent UI appears (can't drive real email delivery in
  CI, so the flow stops there — this matches the precedent set in
  `[[project_smtp_resend_setup]]`'s manual-verification note for email-dependent flows). A
  separate case can pre-seed a session (as other authenticated-page E2E tests already do) and
  drive `LeagueSettingsPage`'s change-password form end-to-end, since that path doesn't depend
  on email delivery.
- Per project convention (`CLAUDE.md` → "Before Every Commit"), both `npm run test` and
  `npx playwright test` must pass before committing.

## Out of Scope

- Rate-limiting or CAPTCHA on `resetPasswordForEmail` beyond whatever Supabase applies by
  default — no evidence of abuse today, and adding one is a separate decision if it becomes a
  problem.
- Forcing sign-out-everywhere / invalidating other sessions after a password change — Supabase's
  `updateUser` doesn't do this automatically, and adding session-revocation is a bigger feature
  than what was asked for here.
- Any change to `SignupForm.tsx`'s or `InvitePage.tsx`'s existing signup password rules.
- Editing the `reset-password.html` Dashboard template itself — it already exists and is
  documented in `[[project_smtp_resend_setup]]` and
  `docs/supabase-email-templates/README.md`; applying it in the Dashboard (if not already
  applied) is a manual production step outside this design, to be confirmed with the user
  separately, same as the localized-email-templates design before it.
