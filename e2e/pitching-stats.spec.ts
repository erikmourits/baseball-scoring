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
 * Open the Sub page, assign 'P' to the first player in the lineup (Player 1),
 * confirm, then wait until the pitcher badge ("baseball Player 1") is visible
 * in the scoreboard. The badge renders only after GamePage.handleSubClose reads
 * the updated lineup and sets homePitcherId / awayPitcherId in React state.
 * Waiting for the badge ensures currentPitcherId is set before the first at-bat
 * is recorded (a plain waitForTimeout(300) is not a reliable signal).
 *
 * Quick-add creates lineups with isStartingPitcher: false, so we must do this
 * once per team before their first at-bat as the fielding team.
 */
async function assignPitcherForFieldingTeam(page: Page) {
  await page.getByRole('button', { name: /wissel|sub/i }).click()
  // First select in the Sub page = position dropdown for Player 1 (batting order 1)
  await page.locator('select').first().selectOption('P')
  await page.getByRole('button', { name: /bevestigen|confirm/i }).first().click()
  // Wait until the pitcher badge appears in the scoreboard — this is the earliest
  // reliable signal that currentPitcherId has been committed to React state.
  await expect(page.getByText('Player 1').first()).toBeVisible({ timeout: 2_000 })
  // The badge contains a baseball emoji prefix; confirm it's the pitcher label.
  await page.waitForFunction(
    () => document.body.textContent?.includes('⚾'),
    { timeout: 2_000 },
  )
}

/**
 * Fire a WP between at-bats. With exactly one runner on base the game
 * auto-selects them; we only need to click the event button then Confirm.
 */
async function fireWP(page: Page) {
  await page.getByRole('button', { name: 'WP' }).click()
  const confirmBtn = page.getByRole('button', { name: /bevestigen|confirm/i }).first()
  await expect(confirmBtn).toBeEnabled({ timeout: 2_000 })
  await confirmBtn.click()
  await page.waitForTimeout(150)
}

/**
 * Fire a BALK. Runners advance immediately — no confirm dialog.
 */
async function fireBalk(page: Page) {
  await page.getByRole('button', { name: 'BALK' }).click()
  await page.waitForTimeout(150)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Game Summary — pitching line stats', () => {

  /**
   * Scenario — 3 innings, 3 batters per team.
   *
   * Home pitcher (Player 1 of home team, pitches top halves):
   *
   *   Inning 1 Top:  BB(B1), 1B(B2), HR(B3 -> all score, rbiCount=3), K, K, K
   *     Stats: bb=1, h=2 (1B+HR), r=3 (HR rbiCount), k=3, outs=3
   *
   *   Inning 2 Top:  3B(B1), WP(B1 on 3rd scores), K, ROE(B3 on 1st), K, K
   *     WP creates LocalBaserunningEvent{toBase:'score'} -- counts toward r.
   *     ROE is NOT in HIT_RESULTS so h is unchanged.
   *     Stats adds: h=1 (3B), r=1 (WP event), k=3, outs=3
   *
   *   Inning 3 Top:  3B(B3), BALK(B3 on 3rd scores), K, K, K
   *     BALK creates LocalBaserunningEvent{toBase:'score'}.
   *     Stats adds: h=1 (3B), r=1 (BALK event), k=3, outs=3
   *
   *   Total home pitcher: outs=9, ip=3.0, h=4, r=5, bb=1, k=9
   *   ERA = (5 x 27) / 9 = 15.00
   *
   * Away pitcher (Player 1 of away team, pitches bottom halves):
   *   All K. outs=9, ip=3.0, h=0, r=0, ERA=0.00
   *
   * Linescore (away): inning-1=3, inning-2=1 (WP), inning-3=1 (BALK), total=5
   */
  test('ERA, R, H, K, IP reflect at-bat outcomes and baserunning events', async ({ page }) => {

    // ── Step 1: Create a game ──────────────────────────────────────────────
    await page.goto('/games/new')
    await expect(page.getByRole('heading', { name: /nieuwe wedstrijd|new game/i }))
      .toBeVisible({ timeout: 10_000 })

    const quickAddBtns = page.locator('button').filter({ hasText: /snel toevoegen|quick add/i })
    await quickAddBtns.nth(0).click()
    await quickAddBtns.nth(1).click()

    await page.locator('input[placeholder="Naam thuisteam"]').or(
      page.locator('input[placeholder="Home team name"]'),
    ).fill(`Era-Home-${RUN_ID}`)
    await page.locator('input[placeholder="Naam tegenstander"]').or(
      page.locator('input[placeholder="Opponent name"]'),
    ).fill(`Era-Away-${RUN_ID}`)

    const batterInputs = page.locator('input[type="number"]')
    await batterInputs.nth(0).fill('3')
    await batterInputs.nth(1).fill('3')

    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
    await page.getByRole('button', { name: /wedstrijd starten|start game/i }).click()
    await expect(page).toHaveURL(/\/games\/[0-9a-f-]{36}$/, { timeout: 60_000 })
    await expect(page.locator('text=Player 1')).toBeVisible({ timeout: 15_000 })

    // ── Step 2: Assign home pitcher (top of 1st -- home team is fielding) ──
    // Quick-add creates lineups with isStartingPitcher: false. We open Sub,
    // set Player 1 to 'P', and wait for the pitcher badge in the scoreboard
    // to confirm React state has committed currentPitcherId before recording.
    await assignPitcherForFieldingTeam(page)

    // ── Step 3: Record innings ─────────────────────────────────────────────

    // Inning 1 Top: BB (B1), 1B (B2; B1->2nd), HR (all score, rbiCount=3), K, K, K
    await recordAB(page, 'BB')
    await recordAB(page, '1B')
    await recordAB(page, 'HR')
    await recordHalfInning(page, ['K', 'K', 'K'])

    // Bottom 1st: assign away pitcher first (away team is now fielding)
    await assignPitcherForFieldingTeam(page)
    await recordHalfInning(page, ['K', 'K', 'K'])

    // Inning 2 Top: 3B puts B1 on 3rd, WP scores B1 (baserunning event)
    await recordAB(page, '3B')
    await fireWP(page)
    await recordAB(page, 'K')    // out 1
    await recordAB(page, 'ROE')  // B3 on 1st -- NOT a hit for pitcher
    await recordAB(page, 'K')    // out 2
    await recordAB(page, 'K')    // out 3
    await page.waitForTimeout(700)

    // Bottom 2nd
    await recordHalfInning(page, ['K', 'K', 'K'])

    // Inning 3 Top: 3B puts B3 on 3rd, BALK scores B3 (baserunning event)
    await recordAB(page, '3B')
    await fireBalk(page)
    await recordHalfInning(page, ['K', 'K', 'K'])

    // Bottom 3rd
    await recordHalfInning(page, ['K', 'K', 'K'])

    // ── Step 4: End the game ──────────────────────────────────────────────
    await page.getByRole('button', { name: /wedstrijd beëindigen|end game/i }).first().click()
    await expect(
      page.locator('button').filter({ hasText: /wedstrijd beëindigen|end game/i }).last(),
    ).toBeVisible({ timeout: 3_000 })
    await page.locator('button').filter({ hasText: /wedstrijd beëindigen|end game/i }).last().click()
    await expect(page).toHaveURL(/\/games\/[\w-]+\/summary/, { timeout: 10_000 })

    // ── Step 5: Verify linescore ──────────────────────────────────────────
    // Linescore pads to 9 innings. Column layout: team-name | inn1-inn9 | R | H
    // Away row indices: td(0)=name, td(1)=inn1, ..., td(9)=inn9, td(10)=R, td(11)=H
    const awayRow = page.locator('table').first().locator('tbody tr').first()
    const td = (n: number) => awayRow.locator('td').nth(n)

    await expect(td(1)).toHaveText('3')   // inning 1: HR rbiCount=3
    await expect(td(2)).toHaveText('1')   // inning 2: WP baserunning event scores 1
    await expect(td(3)).toHaveText('1')   // inning 3: BALK baserunning event scores 1
    await expect(td(10)).toHaveText('5')  // total R

    // ── Step 6: Home pitcher stats ────────────────────────────────────────
    // ERA 15.00 uniquely identifies this row (away pitcher has 0.00).
    await expect(page.getByText('15.00')).toBeVisible()
    const homePitcherRow = page.getByText('15.00').locator('..')
    await expect(homePitcherRow).toContainText('Player 1')
    await expect(homePitcherRow).toContainText('L')   // losing decision

    // Spans in DOM order: [0]=name outer, [1]=decision badge, [2]=ERA, [3]=IP, [4]=H, [5]=R, [6]=K
    const hs = homePitcherRow.locator('span')
    await expect(hs.nth(2)).toHaveText('15.00')   // ERA
    await expect(hs.nth(3)).toHaveText('3.0')     // IP: 9 outs = 3.0
    await expect(hs.nth(4)).toHaveText('4')       // H: 1B+HR+3B+3B=4; ROE excluded
    await expect(hs.nth(5)).toHaveText('5')       // R: 3(HR)+1(WP event)+1(BALK event)
    await expect(hs.nth(6)).toHaveText('9')       // K: 3 per inning x 3

    // ── Step 7: Away pitcher stats ────────────────────────────────────────
    // Faced all-K home batters: r=0, h=0, ERA=0.00
    const awayEraSpan = page.getByText('0.00').first()
    await expect(awayEraSpan).toBeVisible()
    const awayPitcherRow = awayEraSpan.locator('..')
    await expect(awayPitcherRow).toContainText('Player 1')
    await expect(awayPitcherRow).toContainText('W')   // winning decision

    const as_ = awayPitcherRow.locator('span')
    await expect(as_.nth(2)).toHaveText('0.00')   // ERA
    await expect(as_.nth(3)).toHaveText('3.0')    // IP
    await expect(as_.nth(4)).toHaveText('0')      // H
    await expect(as_.nth(5)).toHaveText('0')      // R
    await expect(as_.nth(6)).toHaveText('9')      // K

    // ── Step 8: Force sync ────────────────────────────────────────────────
    const syncResult = await page.evaluate(() => (window as any).__forceSync()) as { errors: string[] }
    if (syncResult.errors.length > 0) {
      throw new Error('forceSync errors:\n' + syncResult.errors.join('\n'))
    }
  })
})
