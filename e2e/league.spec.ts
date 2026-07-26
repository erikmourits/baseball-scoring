import { test, expect } from '@playwright/test'

test.describe('League settings', () => {
  test('league settings page loads', async ({ page }) => {
    await page.goto('/league')
    await expect(page.locator('body')).not.toContainText('Error')
  })

  test('dark mode toggle is present', async ({ page }) => {
    await page.goto('/league')
    // The toggle renders as a moon/sun emoji button
    const toggle = page.locator('button').filter({ hasText: /🌙|☀/ })
    await expect(toggle).toBeVisible()
  })

  test('dark mode toggle switches the html class', async ({ page }) => {
    await page.goto('/league')

    const isDarkBefore = await page.evaluate(() =>
      document.documentElement.classList.contains('dark')
    )

    await page.locator('button').filter({ hasText: /🌙|☀/ }).click()

    const isDarkAfter = await page.evaluate(() =>
      document.documentElement.classList.contains('dark')
    )

    expect(isDarkAfter).toBe(!isDarkBefore)

    // Restore original state so other tests are unaffected
    await page.locator('button').filter({ hasText: /🌙|☀/ }).click()
  })

  test('language toggle switches between EN and NL', async ({ page }) => {
    await page.goto('/league')

    // The language toggle renders as "NL" or "EN" button
    const langToggle = page.locator('button').filter({ hasText: /^(NL|EN)$/ })
    await expect(langToggle).toBeVisible()

    await langToggle.click()
    await expect(page.locator('body')).not.toContainText('Error')

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
    const originalPassword = process.env.E2E_PASSWORD!
    const tempPassword = `${originalPassword}-tmp`
    const email = process.env.E2E_EMAIL!

    await page.goto('/league')
    await page.getByRole('button', { name: /change password|wachtwoord wijzigen/i }).first().click()

    try {
      const passwordInputs = page.locator('form input[type="password"]')
      await passwordInputs.nth(0).fill(originalPassword)
      await passwordInputs.nth(1).fill(tempPassword)
      await passwordInputs.nth(2).fill(tempPassword)
      await page.getByRole('button', { name: /change password|wachtwoord wijzigen/i }).click()

      // Success is reported via the app's ConfirmDialog (alertOnly)
      await expect(page.getByText(/password changed|wachtwoord gewijzigd/i)).toBeVisible({ timeout: 10_000 })
      await page.getByRole('button', { name: /^ok$/i }).click()
    } finally {
      // GoTrue rejects updateUser({ password }) when it matches the current
      // password ("New password should be different from the old password"),
      // so this test goes through a temporary password above and restores
      // the fixture's real password here via the admin API, so the rest of
      // the suite (which logs in via auth.setup.ts with E2E_PASSWORD) keeps
      // working. Always runs, even if an assertion above failed. Local
      // Supabase only -- these are the well-known default local dev keys,
      // not secrets.
      await restoreFixturePassword(email, originalPassword)
    }
  })
})

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
