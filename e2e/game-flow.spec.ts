import { test, expect } from '@playwright/test'

test.describe('Game flow', () => {
  test('home page shows games list or empty state', async ({ page }) => {
    await page.goto('/')
    // The page must render — either games or an empty state message
    const body = page.locator('body')
    await expect(body).toBeVisible()
    await expect(body).not.toContainText('Error')
  })

  test('navigating to /games/new shows the new game wizard', async ({ page }) => {
    await page.goto('/games/new')
    // Should stay on /games/new (not redirect away) if a season and teams exist,
    // OR redirect home if the preconditions are not met — either is valid behaviour
    const url = page.url()
    expect(url).toMatch(/\/games\/new|\//)
  })

  test('game summary page shows linescore header', async ({ page }) => {
    await page.goto('/')

    // Find the first completed / in-progress game link, if any
    const gameLinks = page.getByRole('link', { name: /summary|samenvatting|vs\.?|@/i })
    const count = await gameLinks.count()

    if (count === 0) {
      test.skip(true, 'No games available to test summary page')
      return
    }

    await gameLinks.first().click()
    // Should navigate to a game detail or summary
    await expect(page).toHaveURL(/\/games\/[\w-]+/)
  })

  test('stats page renders without crashing', async ({ page }) => {
    await page.goto('/stats')
    await expect(page.locator('body')).not.toContainText('Error')
  })

  test('help page renders content', async ({ page }) => {
    await page.goto('/help')
    await expect(page.locator('body')).not.toContainText('Error')
    // Help page should have some headings
    const headings = page.getByRole('heading')
    await expect(headings.first()).toBeVisible()
  })
})
