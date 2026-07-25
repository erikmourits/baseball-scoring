# Localized Auth Emails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send Supabase auth emails (signup confirmation, invite, magic link, change email, reset password) in the recipient's actual language (English or Dutch) instead of always English.

**Architecture:** Stamp `user_metadata.lang` on the user at signup. Each of Supabase's 5 relevant Dashboard email templates gets a `{{if eq .Data.lang "en"}}...{{else}}...{{end}}` block around its subject/body text. No new service, no new secret, no code deploy — Supabase's existing built-in mailer (already routed through the project's Resend SMTP config) keeps sending the mail; only the template content changes. See `docs/superpowers/specs/2026-07-25-localized-auth-emails-design.md` for the full design and Supabase's own docs on the mechanism: https://supabase.com/docs/guides/troubleshooting/customizing-emails-by-language-KZ_38Q

**Tech Stack:** React + react-i18next (front-end signup change), Supabase's Go templating language (Dashboard email templates — plain HTML files kept in this repo for reference and as the exact paste-in content).

## Global Constraints

- Only `'en'` and `'nl'` are supported languages.
- Language fallback when `.Data.lang` is missing or not exactly `"en"` is Dutch — a Go `{{if eq .Data.lang "en"}}...{{else}}...{{end}}` block satisfies this by construction (English only on exact match, Dutch for anything else including absence).
- This plan does not touch `supabase/migrations/` or any database schema.
- Pasting template content into the Supabase Dashboard is a production-affecting content edit. Per project convention (see the original SMTP setup, which was also a manual Dashboard step) this is done manually and must be explicitly confirmed with the user at execution time — never scripted or automated.
- Templates must include `<meta charset="utf-8">` since the Dutch copy contains accented characters (e.g. "één").
- The shared footer disclaimer ("if you didn't request this...") must appear exactly once per template, in the footer only — never restated inline in a body paragraph too.
- Before committing the task that touches `src/`, run `npm run test` and `npx playwright test` and confirm both pass (project convention — see CLAUDE.md "Before Every Commit"). Note: this repo's Playwright suite requires a local Supabase dev environment this project intentionally doesn't maintain (see CLAUDE.md, Phase 7.2 skipped) — if Playwright can't run in the execution environment for that reason, that's a pre-existing limitation, not a task defect; Vitest passing is still required.

---

### Task 1: Stamp signup language on the front end

**Files:**
- Modify: `src/components/auth/SignupForm.tsx:10,22`
- Modify: `src/pages/InvitePage.tsx:19,101`

**Interfaces:**
- Produces: `user_metadata.lang: 'en' | 'nl'` on every new user created through these two forms — this is what the Dashboard templates' `{{ .Data.lang }}` reads.

- [ ] **Step 1: Update `SignupForm.tsx`**

Change line 10 from:
```typescript
  const { t } = useTranslation()
```
to:
```typescript
  const { t, i18n } = useTranslation()
```

Change line 22 from:
```typescript
    const { error } = await supabase.auth.signUp({ email, password })
```
to:
```typescript
    const lang = i18n.language?.startsWith('nl') ? 'nl' : 'en'
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { lang } } })
```

- [ ] **Step 2: Update `InvitePage.tsx`**

Change line 19 from:
```typescript
  const { t }        = useTranslation()
```
to:
```typescript
  const { t, i18n }  = useTranslation()
```

Change lines 99-101 from:
```typescript
    const { error } = authMode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password })
```
to:
```typescript
    const lang = i18n.language?.startsWith('nl') ? 'nl' : 'en'
    const { error } = authMode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { data: { lang } } })
```

(Normalization matches the existing pattern in `src/components/LanguageToggle.tsx:5` — `startsWith('nl')` rather than checking for `'en'` directly, so any unrecognized locale defaults to English at signup time app-side. The Dashboard template's own `{{else}}` branch is the one that defaults to Dutch, for accounts where `.Data.lang` is absent entirely — e.g. accounts created before this change.)

- [ ] **Step 3: Run the test suites**

```bash
npm run test
npx playwright test
```

Expected: Vitest passing with the same count as before this change (no test in this repo currently asserts on `signUp` call arguments, so no test changes are expected). If Playwright cannot run because there is no local Supabase dev environment available (a pre-existing, project-wide limitation — see Global Constraints), note that in the report rather than treating it as a failure of this task.

- [ ] **Step 4: Commit**

```bash
git add src/components/auth/SignupForm.tsx src/pages/InvitePage.tsx
git commit -m "feat: stamp signup language on new users for localized auth emails"
```

---

### Task 2: Author the 5 localized Dashboard email templates

**Files:**
- Create: `docs/supabase-email-templates/confirm-signup.html`
- Create: `docs/supabase-email-templates/invite-user.html`
- Create: `docs/supabase-email-templates/magic-link.html`
- Create: `docs/supabase-email-templates/change-email-address.html`
- Create: `docs/supabase-email-templates/reset-password.html`
- Create: `docs/supabase-email-templates/README.md`
- Modify: `.gitignore` (this repo ignores `docs/` wholesale; add an un-ignore for this new directory so it's actually committable — see Step 0)

**Interfaces:**
- Consumes: none from Task 1 (these files don't reference the front-end code; they only assume `.Data.lang` will be populated by it).
- Produces: the exact HTML to paste into Supabase Dashboard → Auth → Templates → `<template>` in Task 3.

This project runs a hosted-only Supabase project (no local/self-hosted dev environment — see CLAUDE.md), so there is no `config.toml` + `content_path` deploy path for these; the Dashboard's template editor is the actual source of truth per Supabase's own docs. These files exist as version-controlled reference copies and as the literal paste-in content.

Each template shares the same brand shell (brand-500 navy `#1e3a5f` header bar, matching the app's tone) with only the heading/body/button text and the footer disclaimer varying by language via `{{if eq .Data.lang "en"}}...{{else}}...{{end}}`. All 5 templates use Supabase's built-in `{{ .ConfirmationURL }}` merge tag for the action link (available on all 5 per Supabase's docs). Each includes `<meta charset="utf-8">` for the accented Dutch characters. The footer disclaimer appears once, in the footer — never restated in the body paragraph.

- [ ] **Step 0: Un-ignore the new directory**

This repo's `.gitignore` has a blanket `docs/` entry. Add these two lines to the end of `.gitignore`:
```
!docs/supabase-email-templates/
!docs/supabase-email-templates/**
```

- [ ] **Step 1: Write `confirm-signup.html`**

```html
<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"></head>
  <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background-color:#1e3a5f;padding:20px 32px;">
                <span style="color:#ffffff;font-size:18px;font-weight:bold;">Baseball Scoring</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">{{if eq .Data.lang "en"}}Confirm your email{{else}}Bevestig je e-mailadres{{end}}</h1>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#374151;">{{if eq .Data.lang "en"}}Thanks for signing up for Baseball Scoring. Click the button below to confirm your email address and finish creating your account.{{else}}Bedankt voor je aanmelding bij Baseball Scoring. Klik op de onderstaande knop om je e-mailadres te bevestigen en je account af te ronden.{{end}}</p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background-color:#1e3a5f;border-radius:6px;">
                      <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">{{if eq .Data.lang "en"}}Confirm email{{else}}E-mail bevestigen{{end}}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#9ca3af;">{{if eq .Data.lang "en"}}If you didn't request this, you can safely ignore this email.{{else}}Heb je dit niet aangevraagd? Dan kun je deze e-mail negeren.{{end}}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

- [ ] **Step 2: Write `invite-user.html`**

Same shell as Step 1 (including `<meta charset="utf-8">`), with:
- Heading: `{{if eq .Data.lang "en"}}You're invited{{else}}Je bent uitgenodigd{{end}}`
- Body: `{{if eq .Data.lang "en"}}You've been invited to join Baseball Scoring. Click the button below to accept the invite and set up your account.{{else}}Je bent uitgenodigd om deel te nemen aan Baseball Scoring. Klik op de onderstaande knop om de uitnodiging te accepteren en je account in te stellen.{{end}}`
- Button: `{{if eq .Data.lang "en"}}Accept invite{{else}}Uitnodiging accepteren{{end}}`
- Footer: same as Step 1

```html
<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"></head>
  <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background-color:#1e3a5f;padding:20px 32px;">
                <span style="color:#ffffff;font-size:18px;font-weight:bold;">Baseball Scoring</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">{{if eq .Data.lang "en"}}You're invited{{else}}Je bent uitgenodigd{{end}}</h1>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#374151;">{{if eq .Data.lang "en"}}You've been invited to join Baseball Scoring. Click the button below to accept the invite and set up your account.{{else}}Je bent uitgenodigd om deel te nemen aan Baseball Scoring. Klik op de onderstaande knop om de uitnodiging te accepteren en je account in te stellen.{{end}}</p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background-color:#1e3a5f;border-radius:6px;">
                      <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">{{if eq .Data.lang "en"}}Accept invite{{else}}Uitnodiging accepteren{{end}}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#9ca3af;">{{if eq .Data.lang "en"}}If you didn't request this, you can safely ignore this email.{{else}}Heb je dit niet aangevraagd? Dan kun je deze e-mail negeren.{{end}}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

- [ ] **Step 3: Write `magic-link.html`**

```html
<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"></head>
  <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background-color:#1e3a5f;padding:20px 32px;">
                <span style="color:#ffffff;font-size:18px;font-weight:bold;">Baseball Scoring</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">{{if eq .Data.lang "en"}}Sign in to Baseball Scoring{{else}}Inloggen bij Baseball Scoring{{end}}</h1>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#374151;">{{if eq .Data.lang "en"}}Click the button below to sign in. This link can only be used once.{{else}}Klik op de onderstaande knop om in te loggen. Deze link kan maar één keer worden gebruikt.{{end}}</p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background-color:#1e3a5f;border-radius:6px;">
                      <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">{{if eq .Data.lang "en"}}Sign in{{else}}Inloggen{{end}}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#9ca3af;">{{if eq .Data.lang "en"}}If you didn't request this, you can safely ignore this email.{{else}}Heb je dit niet aangevraagd? Dan kun je deze e-mail negeren.{{end}}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

- [ ] **Step 4: Write `change-email-address.html`**

```html
<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"></head>
  <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background-color:#1e3a5f;padding:20px 32px;">
                <span style="color:#ffffff;font-size:18px;font-weight:bold;">Baseball Scoring</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">{{if eq .Data.lang "en"}}Confirm your new email{{else}}Bevestig je nieuwe e-mailadres{{end}}</h1>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#374151;">{{if eq .Data.lang "en"}}Click the button below to confirm this email address as the new sign-in email for your Baseball Scoring account.{{else}}Klik op de onderstaande knop om dit e-mailadres te bevestigen als het nieuwe inlogadres voor je Baseball Scoring account.{{end}}</p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background-color:#1e3a5f;border-radius:6px;">
                      <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">{{if eq .Data.lang "en"}}Confirm new email{{else}}Nieuw e-mailadres bevestigen{{end}}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#9ca3af;">{{if eq .Data.lang "en"}}If you didn't request this, you can safely ignore this email.{{else}}Heb je dit niet aangevraagd? Dan kun je deze e-mail negeren.{{end}}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

- [ ] **Step 5: Write `reset-password.html`**

```html
<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"></head>
  <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background-color:#1e3a5f;padding:20px 32px;">
                <span style="color:#ffffff;font-size:18px;font-weight:bold;">Baseball Scoring</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">{{if eq .Data.lang "en"}}Reset your password{{else}}Wachtwoord opnieuw instellen{{end}}</h1>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#374151;">{{if eq .Data.lang "en"}}We received a request to reset the password for your Baseball Scoring account. Click the button below to choose a new password.{{else}}We hebben een verzoek ontvangen om het wachtwoord van je Baseball Scoring account opnieuw in te stellen. Klik op de onderstaande knop om een nieuw wachtwoord te kiezen.{{end}}</p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background-color:#1e3a5f;border-radius:6px;">
                      <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">{{if eq .Data.lang "en"}}Reset password{{else}}Wachtwoord opnieuw instellen{{end}}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#9ca3af;">{{if eq .Data.lang "en"}}If you didn't request this, you can safely ignore this email.{{else}}Heb je dit niet aangevraagd? Dan kun je deze e-mail negeren.{{end}}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

Note: the disclaimer footer already covers "if you didn't request this" for every template, including reset-password — don't restate it in the body paragraph too (see Global Constraints).

- [ ] **Step 6: Write `README.md`**

```markdown
# Supabase auth email templates

Reference copies of the 5 localized (EN/NL) Dashboard email templates for this
project's Supabase Auth. This project runs hosted-only Supabase (no local/
self-hosted dev environment), so the Dashboard's template editor is the actual
source of truth — there is no CLI-based deploy path for these. These files
exist for version control and as the exact paste-in content.

To apply a template: Supabase Dashboard → Auth → Templates → select the
template → paste the matching file's content into the body field.

| File | Dashboard template | Default subject | EN/NL subject |
|---|---|---|---|
| `confirm-signup.html` | Confirm signup | Confirm your email address | Confirm your Baseball Scoring account / Bevestig je Baseball Scoring account |
| `invite-user.html` | Invite user | You've been invited | You've been invited to Baseball Scoring / Je bent uitgenodigd voor Baseball Scoring |
| `magic-link.html` | Magic Link | Your sign-in link | Your Baseball Scoring sign-in link / Je Baseball Scoring inloglink |
| `change-email-address.html` | Change Email Address | Confirm your new email address | Confirm your new email address / Bevestig je nieuwe e-mailadres |
| `reset-password.html` | Reset Password | Reset your password | Reset your Baseball Scoring password / Wachtwoord opnieuw instellen voor Baseball Scoring |

The Subject field is separate from the body in the Dashboard editor. Try the
same `{{if eq .Data.lang "en"}}...{{else}}...{{end}}` syntax there first; if
the Dashboard doesn't render conditionals in that field, use the combined
"EN/NL subject" column above as a bilingual fallback. This needs to be
confirmed by hand when applying the templates — Supabase's docs don't state
either way for the Subject field specifically.

All 5 templates rely on `.Data.lang` being `"en"` or `"nl"` on the user's
`user_metadata`, set at signup by `src/components/auth/SignupForm.tsx` and
`src/pages/InvitePage.tsx`. Anything other than exactly `"en"` (including a
missing value, for accounts created before this change) renders the Dutch
branch.
```

- [ ] **Step 7: Review for coverage**

Confirm all 5 templates share the same brand shell (including `<meta charset="utf-8">`), each has both `en` and `nl` branches for heading/body/button/footer, the footer disclaimer is not also restated in any body paragraph, and `{{ .ConfirmationURL }}` appears in every template's action link. There is no automated test for this step — Supabase's Go templates aren't run by this repo's test suites — it's a direct-read review.

- [ ] **Step 8: Commit**

```bash
git add docs/supabase-email-templates/ .gitignore
git commit -m "docs: add localized (EN/NL) Supabase auth email templates"
```

---

### Task 3: Apply and verify the templates (manual, production-affecting — confirm each step with the user before doing it)

This task has no automated steps — it's a runbook. Do not make any Dashboard change without the user's explicit go-ahead at that moment; editing live auth email templates affects every real user who signs up, resets a password, etc. from that point on.

- [ ] **Step 1: Paste each template**

For each of the 5 rows in `docs/supabase-email-templates/README.md`'s table: Dashboard → Auth → Templates → select the template → paste in the matching file's body content.

- [ ] **Step 2: Set the subject**

Try the `{{if eq .Data.lang "en"}}...{{else}}...{{end}}` conditional in the Subject field first. If the Dashboard rejects it or renders it literally (visible as raw `{{if...}}` text in a test email), fall back to the bilingual subject from the README's table instead.

- [ ] **Step 3: End-to-end verification**

Sign up two throwaway test accounts through the real app — one with the language toggle set to English, one set to Dutch — and confirm:
- The confirmation email arrives in the expected language (subject and body).
- The confirmation link in the email actually confirms the account (click it, confirm you land in the app logged in).

- [ ] **Step 4: Update memory**

Once verified working, save a project memory documenting this (Dashboard template location, that it depends on `user_metadata.lang` set at signup, and the Subject-field conditional-vs-bilingual-fallback finding from Step 2) — future debugging of "wrong-language email" issues should check the Dashboard template content and the signup metadata first.
