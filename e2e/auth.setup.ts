import { test as setup, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const authFile = path.join(__dirname, '.auth/user.json')

setup('authenticate', async ({ page }) => {
  const email = process.env.E2E_EMAIL
  const password = process.env.E2E_PASSWORD

  if (!email || !password) {
    throw new Error(
      'E2E_EMAIL and E2E_PASSWORD environment variables are required.\n' +
      'Create a .env.e2e file or set them before running: E2E_EMAIL=... E2E_PASSWORD=... npx playwright test'
    )
  }

  await page.goto('/auth')

  // Wait for the login form
  await expect(page.locator('input[type="email"]')).toBeVisible()

  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()

  // After login, the app redirects to home (/) and shows the bottom nav
  await page.waitForURL('/', { timeout: 15_000 })
  await expect(page.locator('nav')).toBeVisible()

  await page.context().storageState({ path: authFile })
})
