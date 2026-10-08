import { test as setup, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/**
 * Logs in once and saves the session to .auth/state.json, so every clip starts
 * already signed in and the video doesn't open on a login form. Skipped when
 * TV_USERNAME/TV_PASSWORD are unset (public apps, or a clip that films login).
 *
 * The defaults match most login forms; override per app with
 *   TV_LOGIN_PATH (default "login"), TV_USER_SELECTOR, TV_PASS_SELECTOR, TV_SUBMIT_SELECTOR.
 * Credentials come from the environment only — never write them into a file.
 */
setup('sign in', async ({ page }) => {
  const user = process.env.TV_USERNAME;
  const pass = process.env.TV_PASSWORD;
  setup.skip(!user || !pass, 'No TV_USERNAME/TV_PASSWORD — clips run signed out.');

  mkdirSync('.auth', { recursive: true });
  await page.goto(process.env.TV_LOGIN_PATH ?? 'login');
  const userField = page.locator(process.env.TV_USER_SELECTOR ?? 'input[name="username"], input[name="email"], input[type="email"]').first();
  const passField = page.locator(process.env.TV_PASS_SELECTOR ?? 'input[type="password"]').first();
  await userField.fill(user!);
  await passField.fill(pass!);
  await page.locator(process.env.TV_SUBMIT_SELECTOR ?? 'button[type="submit"]').first().click();
  // Signed in = we left the login page. Apps with a second factor need a clip-level step instead.
  await expect(page).not.toHaveURL(/login/i, { timeout: 60_000 });
  await page.context().storageState({ path: '.auth/state.json' });
});
