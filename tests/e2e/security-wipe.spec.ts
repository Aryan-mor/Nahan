
import { expect, test } from '@playwright/test';
import { AuthPage } from '../pages/AuthPage';

test.describe('Security Wipe (Rule 07 & 10)', () => {
  let authPage: AuthPage;

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);

    // 1. Clear State (Execute inside browser)
    await page.goto('/');
    await page.evaluate(async () => {
      // Direct IDB cleanup to ensure clean slate
      // Close any existing connection from the app to prevent blocking
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((window as any).nahanStorage) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (window as any).nahanStorage.close();
      }

      await new Promise((resolve) => {
        const req = indexedDB.deleteDatabase('nahan');
        req.onsuccess = () => resolve(undefined);
        req.onerror = () => resolve(undefined);
        req.onblocked = () => resolve(undefined);
      });
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test('should wipe data after 5 failed PIN attempts', async ({ page }) => {
    // 2. Signup User A
    await authPage.performSignup('User A', '111111');
    await page.waitForTimeout(2000); // Ensure storage persistence settles
    await expect(page.locator('[data-testid="lock-screen-wrapper"]')).not.toBeVisible();

    // 3. Reload to Lock
    await page.reload();
    const lockScreen = page.locator('[data-testid="lock-screen-wrapper"]');
    await expect(lockScreen).toBeVisible();

    // 4. Enter Wrong PIN 5 times
    const wrongPin = '000000';

    // Attempts 1-4: Verify Warning Toast
    for (let i = 1; i <= 4; i++) {
        await authPage.enterPin(wrongPin, lockScreen);
        // Wait for clear toast feedback
        const remaining = 5 - i;
        const pattern = new RegExp(`Incorrect PIN.*${remaining}`, 'i');
        await expect(page.getByText(pattern).first()).toBeVisible();
        await page.waitForTimeout(1000); // Allow toast to settle/animate
    }

    // Attempt 5: Trigger Wipe
    await authPage.enterPin(wrongPin, lockScreen);

    // Expect Max Attempts Error or Wipe notification
    // The exact text in LockScreen.tsx is t('lock.error.max_attempts')
    // We expect it to be visible briefly before reload.
    // Or we expect the RELOAD to happen.

    // Wait for Welcome Screen (indication of wipe & reload)
    // We increase timeout because reload + init takes time.
    await expect(
        page.locator('[data-testid="welcome-start-button"], [data-testid="lang-en-btn"]')
        .first()
    ).toBeVisible({ timeout: 60000 });

    // 5. Verify New Signup Possible (Functional Proof of Wipe)
    // Wait for reload and initialization to settle
    await page.waitForTimeout(5000);

    // Force a fresh navigation to ensure Playwright context is re-attached
    // and application state is fully clean for the new user.
    await page.goto('/');

    await authPage.performSignup('User B', '222222');
  });
});
