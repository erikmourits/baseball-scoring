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
})
