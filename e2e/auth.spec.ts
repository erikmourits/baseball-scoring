import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('signing out redirects to /auth', async ({ page }) => {
    // Sign out, then verify we land on the auth page — this implicitly proves
    // unauthenticated users cannot reach the app.
    await page.goto('/league')
    await page.getByRole('button', { name: /sign out|uitloggen/i }).click()
    await page.waitForURL(/\/auth/, { timeout: 10_000 })
    await expect(page.locator('input[type="email"]')).toBeVisible()
  })

  test('authenticated user sees the home page', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL('/')
    // Bottom nav should be visible
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

async function fetchLatestResetLink(email: string): Promise<string> {
  // The locally running Supabase CLI serves Mailpit on this port (the
  // config.toml section is still named [inbucket] for backwards
  // compatibility, but the REST API it actually speaks is Mailpit's:
  // GET /api/v1/messages (newest-first, unfiltered by recipient) and
  // GET /api/v1/message/{id} with an uppercase `HTML` field.
  const mailUrl = process.env.E2E_INBUCKET_URL ?? 'http://127.0.0.1:54324'

  let matches: any[] = []
  for (let attempt = 0; attempt < 10 && matches.length === 0; attempt++) {
    const listRes = await fetch(`${mailUrl}/api/v1/messages`)
    const body = await listRes.json()
    const messages: any[] = body.messages ?? []
    matches = messages.filter(m =>
      (m.To ?? []).some((to: any) => to.Address?.toLowerCase() === email.toLowerCase())
    )
    if (matches.length === 0) await new Promise(r => setTimeout(r, 1000))
  }
  if (matches.length === 0) throw new Error(`No email arrived for ${email} in the local mail catcher`)

  const latest = matches[0]
  const msgRes = await fetch(`${mailUrl}/api/v1/message/${latest.ID}`)
  const message = await msgRes.json()
  const match = (message.HTML ?? '').match(/href="([^"]+)"/)
  if (!match) throw new Error('No link found in reset password email body')
  return match[1].replace(/&amp;/g, '&')
}

// GoTrue rejects `auth.updateUser({ password })` with "New password should be
// different from the old password" when it matches the current one, so the
// reset flow below has to go through a temporary password rather than the
// fixture's real one. This helper uses the admin API (service role key) to
// restore E2E_PASSWORD afterwards so every other spec in the suite, which
// logs in via auth.setup.ts with that fixed password, keeps working. Local
// Supabase only — these are the well-known default local dev keys, not secrets.
async function restoreFixturePassword(email: string, password: string): Promise<void> {
  const apiUrl = process.env.E2E_SUPABASE_URL ?? 'http://127.0.0.1:54321'
  const serviceRoleKey =
    process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

  const listRes = await fetch(`${apiUrl}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  })
  const { users } = await listRes.json()
  const user = users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase())
  if (!user) throw new Error(`Could not find fixture user ${email} to restore its password`)

  const putRes = await fetch(`${apiUrl}/auth/v1/admin/users/${user.id}`, {
    method: 'PUT',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password }),
  })
  if (!putRes.ok) throw new Error(`Failed to restore fixture password: ${putRes.status} ${await putRes.text()}`)
}

test.describe('Reset password', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('completes the reset flow via the emailed link', async ({ page }) => {
    const email = process.env.E2E_EMAIL!
    const originalPassword = process.env.E2E_PASSWORD!
    const tempPassword = `${originalPassword}-tmp`

    await page.goto('/auth')
    await page.getByRole('button', { name: /forgot password|wachtwoord vergeten/i }).click()
    await page.locator('input[type="email"]').fill(email)
    await page.getByRole('button', { name: /send reset link|reset-link versturen/i }).click()
    await expect(page.getByText(/check your email|controleer je e-mail/i)).toBeVisible({ timeout: 10_000 })

    const link = await fetchLatestResetLink(email)
    await page.goto(link)
    await page.waitForURL(/\/reset-password/, { timeout: 15_000 })

    try {
      await page.locator('input[type="password"]').nth(0).fill(tempPassword)
      await page.locator('input[type="password"]').nth(1).fill(tempPassword)
      await page.getByRole('button', { name: /reset password|wachtwoord opnieuw instellen/i }).click()

      await page.waitForURL('/', { timeout: 15_000 })
      await expect(page.locator('nav')).toBeVisible()
    } finally {
      // Always restore, even if an assertion above failed, so the rest of
      // the suite doesn't inherit a changed fixture password.
      await restoreFixturePassword(email, originalPassword)
    }
  })
})
