import { test, expect } from '@playwright/test'

const RUN_ID = Date.now()

test.describe('Seasons', () => {
  test('seasons page loads without crashing', async ({ page }) => {
    await page.goto('/seasons')
    await expect(page.locator('body')).not.toContainText('Error')
  })

  test('can create a new season', async ({ page }) => {
    // Set up listener before navigating so we never miss the response
    const seasonsPulled = page.waitForResponse(
      r => r.url().includes('/rest/v1/') && r.url().includes('seasons') && r.ok(),
      { timeout: 15_000 },
    )
    await page.goto('/seasons')
    // Await the Supabase seasons fetch — proves useLeague() has resolved a real
    // league value, so league!.id in handleCreate won't throw
    await seasonsPulled
    // Also wait for the DOM to reflect the data (React re-render after Dexie write)
    await expect(
      page.locator('ul li').or(page.locator('p.text-4xl')).first()
    ).toBeVisible({ timeout: 5_000 })

    const seasonName = `E2E Season ${RUN_ID}`

    await page.getByRole('button', { name: /\+ new season|new season|\+ nieuw/i }).click()

    // Label has no htmlFor — locate by type (Year field is type="number")
    const nameInput = page.locator('input[type="text"]').first()
    await expect(nameInput).toBeVisible()
    await nameInput.fill(seasonName)

    await page.getByRole('button', { name: /create season|seizoen aanmaken/i }).click()

    await expect(page.getByText(seasonName)).toBeVisible({ timeout: 15_000 })
  })
})
