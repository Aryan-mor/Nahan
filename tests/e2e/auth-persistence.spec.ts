import { expect, test } from '@playwright/test';
import { AuthPage } from '../pages/AuthPage';

test.describe('Authentication Persistence', () => {
  test('Signup and Persistence', async ({ page }) => {
    test.slow(); // Mark test as slow due to crypto/auth operations

    const authPage = new AuthPage(page);
    const pin = '123456';
    const name = 'TestUser';

    // 1. Initial Signup
    await test.step('Signup Flow', async () => {
      await page.goto('/');
      await authPage.performSignup(name, pin);
    });

    // 2. Reload Page (Skipped due to test-env IDB flakiness - Verified Manually)

  await test.step('Reload Application', async () => {
    // Ensure IDB persistence settles (critical for V2 auth)
    await page.waitForTimeout(5000);
    await page.reload();
    // Wait for app to initialize
    await expect(page.locator('body')).toBeVisible();
  });

  // 3. Verify Lock Screen & Unlock
  await test.step('Unlock Vault', async () => {
    // Should ask for PIN now
    await authPage.performLogin(pin);
  });


    // 4. Verify Access
    await test.step('Verify Dashboard Access', async () => {
      await authPage.verifyDashboard();
    });
  });
});
