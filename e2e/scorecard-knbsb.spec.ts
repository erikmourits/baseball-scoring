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

async function recordAB(page: Page, result: string) {
  await clickResult(page, result)
  await clickRecord(page)
}

async function recordHalfInning(page: Page, results: string[]) {
  for (const r of results) {
    await recordAB(page, r)
  }
  await page.waitForTimeout(700)
}

/**
 * Returns the number of <line> elements that are DIRECT children of the SVG
 * (i.e. base-reached lines, not the divider lines inside <g>).
 */
async function countBaseLines(page: Page, ariaLabel: string): Promise<number> {
  return page.locator(`svg[aria-label="${ariaLabel}"]`).first().evaluate(
    svg => svg.querySelectorAll(':scope > line').length
  )
}

/**
 * Returns the number of <circle> elements anywhere inside the SVG cell.
 */
async function countCircles(page: Page, ariaLabel: string): Promise<number> {
  return page.locator(`svg[aria-label="${ariaLabel}"]`).first().evaluate(
    svg => svg.querySelectorAll('circle').length
  )
}

/**
 * Returns the text content of the first <text> element in the SVG cell.
 */
async function cellText(page: Page, ariaLabel: string): Promise<string> {
  return page.locator(`svg[aria-label="${ariaLabel}"] text`).first().textContent() ?? ''
}

// ── Test ──────────────────────────────────────────────────────────────────────

test.describe('KNBSB Scorecard – cell contents', () => {

  test('renders correct SVG notation inside each cell for every at-bat outcome', async ({ page }) => {

    // Capture console errors — any React rendering error will surface here
    const consoleErrors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    // ── Step 1: Create game with 9 batters per team ────────────────────────

    await page.goto('/games/new')
    await expect(page.getByRole('heading', { name: /nieuwe wedstrijd|new game/i }))
      .toBeVisible({ timeout: 10_000 })

    const quickAddBtns = page.locator('button').filter({ hasText: /snel toevoegen|quick add/i })
    await quickAddBtns.nth(0).click()
    await quickAddBtns.nth(1).click()

    await page.locator('input[placeholder="Naam thuisteam"]').or(
      page.locator('input[placeholder="Home team name"]'),
    ).fill(`KNBSB-Home-${RUN_ID}`)

    await page.locator('input[placeholder="Naam tegenstander"]').or(
      page.locator('input[placeholder="Opponent name"]'),
    ).fill(`KNBSB-Away-${RUN_ID}`)

    const batterInputs = page.locator('input[type="number"]')
    await batterInputs.nth(0).fill('9')
    await batterInputs.nth(1).fill('9')

    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
    await page.getByRole('button', { name: /wedstrijd starten|start game/i }).click()
    await expect(page).toHaveURL(/\/games\/[0-9a-f-]{36}$/, { timeout: 60_000 })
    await expect(page.locator('text=Player 1')).toBeVisible({ timeout: 15_000 })

    // ── Step 2: Record every outcome across 3 innings ─────────────────────
    //
    // Top 1: BB · SAC (needs runner) · HBP · GDP (needs runner → 2 outs)
    // Top 2: 1B · SF  (needs runner) · 2B  · 3B · HR · K · K
    // Top 3: ROE · FC · GO · FO · K
    // Bot 1-3: K·K·K each

    await recordHalfInning(page, ['BB', 'SAC', 'HBP', 'GDP'])
    await recordHalfInning(page, ['K', 'K', 'K'])

    await recordHalfInning(page, ['1B', 'SF', '2B', '3B', 'HR', 'K', 'K'])
    await recordHalfInning(page, ['K', 'K', 'K'])

    await recordHalfInning(page, ['ROE', 'FC', 'GO', 'FO', 'K'])
    await recordHalfInning(page, ['K', 'K', 'K'])

    // ── Step 3: End game & navigate to scorecard ──────────────────────────

    await page.getByRole('button', { name: /wedstrijd beëindigen|end game/i }).first().click()
    await expect(
      page.locator('button').filter({ hasText: /wedstrijd beëindigen|end game/i }).last(),
    ).toBeVisible({ timeout: 3_000 })
    await page.locator('button').filter({ hasText: /wedstrijd beëindigen|end game/i }).last().click()
    await expect(page).toHaveURL(/\/games\/[\w-]+\/summary/, { timeout: 10_000 })

    await page.getByRole('button', { name: /scorecard|scoreformulier/i }).last().click()
    await expect(page).toHaveURL(/\/games\/[\w-]+\/scorecard/, { timeout: 10_000 })

    // Wait for KNBSB scorecard to be fully loaded (not just the page frame)
    await expect(page.locator('svg[aria-label]').first()).toBeVisible({ timeout: 10_000 })

    // No React errors should have occurred
    expect(consoleErrors.filter(e => e.includes('Error') || e.includes('error'))).toEqual([])

    // ── Step 4: Verify SVG cell structure for every outcome ───────────────
    //
    // KNBSB notation rules:
    //   Outs    → circle(s) + text label inside SVG
    //   Hits    → one vertical base-line per base reached (direct <line> child of <svg>)
    //   Reaches → same as 1B line + optional text label
    //   SF      → text label only (batter out, no base reached by batter)
    //
    // The divider lines live inside a <g> element and are NOT counted as base lines.

    // ── Outs: circle + text ──────────────────────────────────────────────

    // K — single circle + "K"
    expect(await countCircles(page, 'K')).toBe(1)
    expect(await cellText(page, 'K')).toBe('K')

    // FO — single circle + "FO"
    expect(await countCircles(page, 'FO')).toBe(1)
    expect(await cellText(page, 'FO')).toBe('FO')

    // GO — single circle + "GO"
    expect(await countCircles(page, 'GO')).toBe(1)
    expect(await cellText(page, 'GO')).toBe('GO')

    // GDP — two concentric circles + "DP"
    expect(await countCircles(page, 'GDP')).toBe(2)
    expect(await cellText(page, 'GDP')).toBe('DP')

    // SAC — one base line in BR + "S"
    expect(await countBaseLines(page, 'SAC')).toBe(1)
    expect(await cellText(page, 'SAC')).toBe('S')

    // SF — no base lines, just "SF" text (batter is out, doesn't reach base)
    expect(await countBaseLines(page, 'SF')).toBe(0)
    expect(await cellText(page, 'SF')).toBe('SF')

    // ── Reaches: base line(s), optional text ─────────────────────────────
    // Phase 12 renders the runner's full inning journey, so a batter who
    // reaches first and later advances shows more than 1 line.
    // We check ≥1 (at least first base) and verify any label text.

    // BB — reaches first, may advance further in the inning
    expect(await countBaseLines(page, 'BB')).toBeGreaterThanOrEqual(1)

    // HBP — one base line + "HP" (runner put out on GDP, stays at first in path)
    expect(await countBaseLines(page, 'HBP')).toBeGreaterThanOrEqual(1)
    expect(await cellText(page, 'HBP')).toBe('HP')

    // ROE — reaches first, may advance further
    expect(await countBaseLines(page, 'ROE')).toBeGreaterThanOrEqual(1)
    expect(await cellText(page, 'ROE')).toBe('E')

    // FC — reaches first, may advance further
    expect(await countBaseLines(page, 'FC')).toBeGreaterThanOrEqual(1)
    expect(await cellText(page, 'FC')).toBe('FC')

    // ── Hits: at least the bases initially reached ────────────────────────
    // Runner advancement may add extra lines beyond the initial reach.

    // 1B — at least one line (first base)
    expect(await countBaseLines(page, '1B')).toBeGreaterThanOrEqual(1)

    // 2B — at least two lines (first + second)
    expect(await countBaseLines(page, '2B')).toBeGreaterThanOrEqual(2)

    // 3B — at least three lines (first + second + third)
    expect(await countBaseLines(page, '3B')).toBeGreaterThanOrEqual(3)

    // HR — always exactly four lines (KNBSBCell always draws all quadrants for HR)
    expect(await countBaseLines(page, 'HR')).toBe(4)

    // ── Step 5: Force sync ───────────────────────────────────────────────

    const syncResult = await page.evaluate(() => (window as any).__forceSync()) as { errors: string[] }
    if (syncResult.errors.length > 0) {
      throw new Error('forceSync errors: ' + syncResult.errors.join(', '))
    }
  })
})
