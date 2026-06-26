import { test, expect, type Page } from '@playwright/test'

const RUN_ID = Date.now()

// ── Helpers ──────────────────────────────────────────────────────────────────

async function clickResult(page: Page, result: string) {
  await page.getByTestId(`result-${result}`).click()
}

async function clickRecord(page: Page) {
  await page.getByTestId('record-atbat').click()
  await page.waitForTimeout(150)
}

/**
 * Select a result and record the at-bat. For outs, fielder selection is optional
 * so we skip it; the Record button is always enabled once a result is selected.
 */
async function recordAB(page: Page, result: string) {
  await clickResult(page, result)
  await clickRecord(page)
}

/**
 * Record a full half-inning. Waits after the last out for the half to advance.
 * The `results` array should produce exactly 3 outs total (K/FO/GO count as 1;
 * HR/1B/2B/3B/BB count as 0). Include non-out results before the final outs.
 */
async function recordHalfInning(page: Page, results: string[]) {
  for (const r of results) {
    await recordAB(page, r)
  }
  // advanceHalf() is called immediately after the 3rd out; give React a moment.
  await page.waitForTimeout(700)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Scorecard page', () => {

  test('creates a game, records 3 innings, and verifies the KNBSB scorecard', async ({ page }) => {

    // ── Step 1: Create a game with Quick Add (both teams, 3 batters each) ───
    await page.goto('/games/new')
    await expect(page.getByRole('heading', { name: /nieuwe wedstrijd|new game/i }))
      .toBeVisible({ timeout: 10_000 })

    // Switch both Home and Away to "Quick Add" mode
    const quickAddBtns = page.locator('button').filter({ hasText: /snel toevoegen|quick add/i })
    await quickAddBtns.nth(0).click()  // home
    await quickAddBtns.nth(1).click()  // away

    // Fill team names
    await page.locator('input[placeholder="Naam thuisteam"]').or(
      page.locator('input[placeholder="Home team name"]'),
    ).fill(`SC-Home-${RUN_ID}`)

    await page.locator('input[placeholder="Naam tegenstander"]').or(
      page.locator('input[placeholder="Opponent name"]'),
    ).fill(`SC-Away-${RUN_ID}`)

    // Set batter count to 3 for each team
    const batterInputs = page.locator('input[type="number"]')
    await batterInputs.nth(0).fill('3')
    await batterInputs.nth(1).fill('3')

    // Wait for the initial pullFromServer to settle — it does bulkPut writes that
    // conflict with handleSave's writes if they overlap, causing a long Dexie queue.
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {
      // networkidle may never fire if background polling is active — that's OK
    })

    // Both Quick Add → "Wedstrijd starten" / "Start game" immediately creates everything
    await page.getByRole('button', { name: /wedstrijd starten|start game/i }).click()
    // UUID game ID — excludes /games/new, /games/upload etc.
    // Quick Add does ~9 Supabase calls sequentially; allow ample time on free tier.
    await expect(page).toHaveURL(/\/games\/[0-9a-f-]{36}$/, { timeout: 60_000 })

    // Wait for GamePage to be ready (at-bat section visible)
    await expect(
      page.locator('text=Player 1'),
    ).toBeVisible({ timeout: 15_000 })

    // ── Step 2: Record 3 full innings ───────────────────────────────────────
    //
    // Lineup cycles with 3 batters:  B1 → B2 → B3 → B1 → …
    //
    // Top 1st  (away bats): K(B1), K(B2), HR(B3 solo – B3 scores), K(B1) = 3 outs
    // Bot 1st  (home bats): K(B1), K(B2), K(B3)
    // Top 2nd  (away bats): K(B2), K(B3), K(B1)
    // Bot 2nd  (home bats): K(B1), K(B2), K(B3)
    // Top 3rd  (away bats): K(B2), K(B3), K(B1)
    // Bot 3rd  (home bats): K(B1), K(B2), K(B3)
    //
    // Away AB totals: B1=4, B2=3, B3=2  (each player bats ≥2 times)
    // Home AB totals: B1=B2=B3=3
    //
    // B3's HR in top 1st → scoredPlayerIds=[B3_id] on that at-bat → R=1 for B3.

    // Top 1st: K, K, HR (not an out), K  → 3 outs
    await recordHalfInning(page, ['K', 'K', 'HR', 'K'])

    // Bottom 1st: K, K, K
    await recordHalfInning(page, ['K', 'K', 'K'])

    // Top 2nd: K, K, K
    await recordHalfInning(page, ['K', 'K', 'K'])

    // Bottom 2nd: K, K, K
    await recordHalfInning(page, ['K', 'K', 'K'])

    // Top 3rd: K, K, K
    await recordHalfInning(page, ['K', 'K', 'K'])

    // Bottom 3rd: K, K, K
    await recordHalfInning(page, ['K', 'K', 'K'])

    // ── Step 3: End the game ────────────────────────────────────────────────
    await page.getByRole('button', { name: /wedstrijd beëindigen|end game/i }).first().click()

    // The confirm dialog appears with the same button label — click the last one (in dialog)
    await expect(
      page.locator('button').filter({ hasText: /wedstrijd beëindigen|end game/i }).last(),
    ).toBeVisible({ timeout: 3_000 })
    await page.locator('button').filter({ hasText: /wedstrijd beëindigen|end game/i }).last().click()

    // Redirects to summary
    await expect(page).toHaveURL(/\/games\/[\w-]+\/summary/, { timeout: 10_000 })

    // ── Step 4: Navigate to Scorecard ───────────────────────────────────────
    await page.getByRole('button', { name: /scorecard|scoreformulier/i }).last().click()
    await expect(page).toHaveURL(/\/games\/[\w-]+\/scorecard/, { timeout: 10_000 })

    // ── Step 5: Verify scorecard structure ──────────────────────────────────

    // KNBSB tab is active, MLB tab is also available
    const knbsbTab = page.getByRole('button', { name: 'KNBSB' })
    const mlbTab   = page.getByRole('button', { name: 'MLB' })
    await expect(knbsbTab).toBeVisible()
    await expect(mlbTab).toBeVisible()

    // Linescore section present
    await expect(page.getByText('Linescore')).toBeVisible()

    // Both team names appear on the page
    await expect(page.getByText(`SC-Away-${RUN_ID}`).first()).toBeVisible()
    await expect(page.getByText(`SC-Home-${RUN_ID}`).first()).toBeVisible()

    // Six player rows (3 away + 3 home) rendered in the batting tables
    await expect(page.locator('tr').filter({ hasText: 'Player 1' })).toHaveCount(2)
    await expect(page.locator('tr').filter({ hasText: 'Player 2' })).toHaveCount(2)
    await expect(page.locator('tr').filter({ hasText: 'Player 3' })).toHaveCount(2)

    // Diamond SVG cells are rendered (at least one visible)
    await expect(page.locator('svg[aria-label]').first()).toBeVisible()

    // K diamonds appear (all the strikeouts we recorded)
    await expect(page.locator('svg[aria-label="K"]').first()).toBeVisible()

    // HR diamond appears (the home run we recorded in top 1st)
    await expect(page.locator('svg[aria-label="HR"]')).toBeVisible()

    // scoredPlayerIds wired up: away team has total R = 1 (the HR batter)
    // The score header shows "1" for the away team — check the linescore row too
    const linescoreRows = page.locator('table').first().locator('tbody tr')
    const awayLinescoreRow = linescoreRows.first()
    // The rightmost column in the linescore is the total (1 for away)
    await expect(awayLinescoreRow.locator('td').last()).toHaveText('1')

    // ── Step 6: Force sync dirty records to Supabase ───────────────────────
    // Ensures all at-bats recorded by Playwright reach the server before the
    // session closes, so the game is visible in the user's own browser.
    const syncResult = await page.evaluate(() => (window as any).__forceSync()) as { errors: string[] }
    if (syncResult.errors.length > 0) {
      throw new Error('forceSync reported errors:\n' + syncResult.errors.join('\n'))
    }

    // Back navigation returns to summary
    await page.getByRole('button', { name: /← samenvatting|← summary/i }).click()
    await expect(page).toHaveURL(/\/games\/[\w-]+\/summary/)
  })

  test('scorecard page renders without crashing for any existing final game', async ({ page }) => {
    await page.goto('/')

    // Find the first game on the home page (if any)
    const gameItem = page.locator('main li button, main li [role="button"]').first()
    const count = await gameItem.count()
    if (count === 0) {
      test.skip(true, 'No games on home page to test')
      return
    }

    await gameItem.click()
    const url = page.url()

    // If it's a summary page, navigate to scorecard
    if (url.includes('/summary')) {
      await page.goto(url.replace('/summary', '/scorecard'))
      await expect(page.locator('body')).not.toContainText('Error')
      // KNBSB tab should always be visible
      await expect(page.getByRole('button', { name: 'KNBSB' })).toBeVisible({ timeout: 5_000 })
    } else {
      test.skip(true, 'Game is in-progress — scorecard only shown for final games')
    }
  })
})
