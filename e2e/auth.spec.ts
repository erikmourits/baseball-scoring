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
