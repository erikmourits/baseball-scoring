import { test, expect } from '@playwright/test'

test.describe('Bottom navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('home page loads and shows game list area', async ({ page }) => {
    await expect(page).toHaveURL('/')
    // Page should have a heading or main content (games list or empty state)
    await expect(page.locator('main').first()).toBeVisible()
  })

  test('Teams tab navigates to /teams', async ({ page }) => {
    // Click the Teams tab in the bottom nav
    await page.getByRole('link', { name: /teams|ploegen/i }).click()
    await expect(page).toHaveURL('/teams')
  })

  test('Seasons tab navigates to /seasons', async ({ page }) => {
    await page.getByRole('link', { name: /seasons|seizoenen/i }).click()
    await expect(page).toHaveURL('/seasons')
  })

  test('Stats tab navigates to /stats', async ({ page }) => {
    await page.getByRole('link', { name: /stats|statistieken/i }).click()
    await expect(page).toHaveURL('/stats')
  })

  test('League tab navigates to /league', async ({ page }) => {
    await page.getByRole('link', { name: /league|competitie/i }).click()
    await expect(page).toHaveURL('/league')
  })

  test('unknown route redirects to home', async ({ page }) => {
    await page.goto('/this-does-not-exist')
    await expect(page).toHaveURL('/')
  })
})
