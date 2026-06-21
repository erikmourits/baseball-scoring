import { test, expect } from '@playwright/test'

// Unique suffix to avoid collisions between test runs
const RUN_ID = Date.now()

test.describe('Teams', () => {
  test('teams page loads', async ({ page }) => {
    await page.goto('/teams')
    // Either shows a list of teams or an empty state — page must not crash
    await expect(page.locator('body')).not.toContainText('Error')
  })

  test('can create a new team', async ({ page }) => {
    // Set up the listener BEFORE navigating so we never miss the response
    const teamsPulled = page.waitForResponse(
      r => r.url().includes('/rest/v1/') && r.url().includes('teams') && r.ok(),
      { timeout: 15_000 },
    )
    await page.goto('/teams')
    // Await the Supabase teams fetch — this proves useLeague() has resolved a real
    // league value, so league!.id in handleCreate won't throw and leave "Saving…" stuck
    await teamsPulled
    // Also wait for the DOM to reflect the data (extra React render tick)
    await expect(
      page.locator('li button').or(page.locator('p.text-gray-400')).first()
    ).toBeVisible({ timeout: 5_000 })

    const teamName = `E2E Team ${RUN_ID}`

    // Open the inline create form
    await page.getByRole('button', { name: /\+ (new|add)|team toevoegen/i }).click()

    // Fill in the team name — label has no htmlFor so locate by placeholder
    const nameInput = page.getByPlaceholder(/MF|Quick|e\.g\./i)
    await expect(nameInput).toBeVisible()
    await nameInput.fill(teamName)

    // Submit — after save the page navigates to the new team's detail page
    await page.getByRole('button', { name: /create team|team aanmaken/i }).click()

    // Creating navigates to /teams/:id
    await expect(page).toHaveURL(/\/teams\/[\w-]+$/, { timeout: 15_000 })
    await expect(page.getByText(teamName)).toBeVisible()
  })

  test('can navigate to team detail page', async ({ page }) => {
    await page.goto('/teams')

    // Team cards are <button> elements inside <li> — click the first one
    const firstTeamCard = page.locator('li button').first()
    await firstTeamCard.click()

    // URL should match /teams/:id
    await expect(page).toHaveURL(/\/teams\/[\w-]+$/)
  })
})
