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
