# Design: Localized Auth Emails

**Date:** 2026-07-25
**Status:** Approved

## Problem

Supabase Auth's built-in email templates (Dashboard → Auth → Templates) currently contain no language branching, so every confirmation/recovery/email-change email sent by Supabase goes out in English, regardless of the user's chosen app language ('en' or 'nl', default 'nl').

## Solution

Per Supabase's own troubleshooting doc, ["Customizing Emails by Language"](https://supabase.com/docs/guides/troubleshooting/customizing-emails-by-language-KZ_38Q), auth emails are rendered with the Go templating language, and every template has access to `{{ .Data }}` — the signed-up user's `user_metadata` — via `.Data.<key>`. That means language branching can live directly inside each Dashboard template as a Go `{{if eq .Data.lang "en"}}...{{else}}...{{end}}` block, with no code deployed and no change to how emails are sent (still Supabase's built-in mailer, still routed through the existing Resend SMTP config already documented in `[[project_smtp_resend_setup]]`).

Two things are required:
1. Stamp `user_metadata.lang` on the user at signup time.
2. Edit each Dashboard email template to wrap its subject/body content in a Go-template conditional on `{{ .Data.lang }}`.

Scope: the 5 auth email templates Supabase's Dashboard exposes that this app could plausibly trigger — **Confirm signup**, **Invite user**, **Magic Link**, **Change Email Address**, **Reset Password** — even though today the app only actually triggers signup confirmation (no password-reset or email-change UI exists yet). Localizing all five now avoids a half-English/half-Dutch gap the moment those flows are added. (**Reauthentication** and the security-notification templates are excluded — nothing in this app triggers them.)

This approach was chosen over a Supabase **Send Email Auth Hook** (a custom Edge Function intercepting and sending mail itself via a third-party API) because it reaches the same goal with far less new production surface: no new service, no webhook signature verification, no new secrets, no change to the already-working SMTP path.

## Architecture

```
supabase.auth.signUp({ options: { data: { lang: 'en' | 'nl' } } })
        │
        ▼
auth.users.raw_user_meta_data.lang persisted
        │
        ▼
Supabase Auth sends a templated email (built-in mailer, existing Resend SMTP)
        │
        ▼
Dashboard template renders: {{if eq .Data.lang "en"}} English copy {{else}} Dutch copy {{end}}
```

No new service, no new secret, no new deploy step. The only "deploy" is pasting updated HTML into the Dashboard's template editor — a manual, production-affecting content edit, the same category of manual step as the original SMTP configuration.

## Components

### Front-end changes

- `src/components/auth/SignupForm.tsx`: `supabase.auth.signUp({ email, password, options: { data: { lang: i18n.language.startsWith('nl') ? 'nl' : 'en' } } })`.
- `src/pages/InvitePage.tsx`: same `options.data.lang` addition to its `supabase.auth.signUp(...)` call (only on the signup branch — not on `signInWithPassword`).
- Both normalize `i18n.language` (which can be `'en-US'`, `'nl-NL'`, etc.) using the same pattern already used in `src/components/LanguageToggle.tsx:5` (`startsWith('nl')`).

### Template content

- Repo-tracked reference copies of the 5 template bodies, under `docs/supabase-email-templates/` (plain `.html` files — Supabase's hosted Dashboard is the actual source of truth per-project; there is no CLI/`config.toml` deploy path for a hosted project, so these files exist for version-control/reference and as the exact text to paste into the Dashboard, not as something the CLI pushes).
- Each file: a shared brand shell (brand-500 navy `#1e3a5f` header/button, matching the app's tone) with heading/body/button text wrapped in `{{if eq .Data.lang "en"}}...{{else}}...{{end}}`.
- Each template uses Supabase's built-in merge tag `{{ .ConfirmationURL }}` for its action link (available on all 5 per Supabase's docs; Change Email Address also has `{{ .NewEmail }}` available if wanted, not required for this design).
- Subject lines are set separately, in the Dashboard's "Subject heading" field; whether that field supports the same `{{if}}` conditional is unconfirmed by Supabase's docs and must be checked by hand when applying the templates — fall back to a combined bilingual subject (e.g. "Confirm your email / Bevestig je e-mailadres") if it doesn't render conditionals.
- Templates should include `<meta charset="utf-8">` in the `<head>`, since the Dutch copy contains accented characters (e.g. "één") that could otherwise mis-render in some email clients.
- The shared footer disclaimer ("If you didn't request this, you can safely ignore this email." / Dutch equivalent) should appear once per template, in the footer only — not restated inline in any body paragraph too.

## Data Flow / Language Resolution

- **New signups:** `user_metadata.lang` is set at signup time from the app's active i18n language. This is the authoritative source for that user's future auth emails too (recovery, email change), not just the initial confirmation.
- **Users created before this ships, or `.Data.lang` absent for any other reason:** the Go template's `{{else}}` branch is Dutch (matching the app's stated i18n default). Since Go's `eq` is simply false for a missing field, `{{if eq .Data.lang "en"}}...{{else}}...{{end}}` already does this correctly (English only on an exact `"en"` match, Dutch otherwise).
- **Invite-only site-invite path** (`supabase/functions/site-invite`, `admin.createUser({ email_confirm: true })`): unaffected — it already sends no email (`email_confirm: true` skips confirmation), so it's outside this design's concern.

## Error Handling

There is no new failure mode to handle — this design doesn't add a service that can be down or misconfigured in a new way. A malformed Go template in the Dashboard editor is caught by Supabase's own template validation/preview before saving; there's no runtime path where this design could fail differently than the existing SMTP-based sending already does today.

## Manual Steps (production-affecting Dashboard edits — confirm with the user before making them)

1. For each of the 5 templates, open Dashboard → Auth → Templates → `<template>`, and replace the body with the corresponding file from `docs/supabase-email-templates/`.
2. Check whether the Subject field accepts the same `{{if}}` conditional; use it if so, otherwise use a combined bilingual subject.
3. Manual verification: sign up two throwaway test accounts (one EN, one NL) through the real app and confirm each confirmation email arrives in the expected language, and that the confirmation link works.

## Testing

- No Vitest/Playwright coverage for the template content — it's rendered server-side by Supabase's Go templating engine, outside those harnesses' scope. Verification is the manual signup test above.
- Front-end changes (`SignupForm.tsx`, `InvitePage.tsx`) are trivial enough (one extra `options.data` field) that existing signup-flow tests, if any cover this path, continue to pass unchanged; no new frontend test is warranted for a single added field.

## Out of Scope

- Building a password-reset or email-change UI (neither exists in the app today) — only the template content for those action types is prepared, ready for when that UI is added.
- Migrating the site-invite or league-invite flows — they don't go through Supabase Auth's mailer.
- Any language other than English/Dutch.
- Reauthentication and security-notification email templates — nothing in this app triggers them.
- A Send Email Auth Hook / custom Edge Function — considered and rejected in favor of the simpler Dashboard-template approach above.
