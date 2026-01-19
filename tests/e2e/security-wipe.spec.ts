
import { expect, test } from '@playwright/test';
import { AuthPage } from '../pages/AuthPage';

test.describe('Security Wipe (Rule 07 & 10)', () => {
  let authPage: AuthPage;

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);

    // 1. Clear State (Execute inside browser)
    await page.goto('/');

    // Performance Optimization: Disable all animations/transitions
    await page.addStyleTag({
      content: '* { transition: none !important; animation: none !important; }',
    });

    await page.evaluate(async () => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      // Direct IDB cleanup to ensure clean slate
      if ((window as any).nahanStorage) {
        try {
          await (window as any).nahanStorage.close();
        } catch { /* ignore */ }
      }

      const dbs = await window.indexedDB.databases();
      for (const db of dbs) {
        if (db.name) {
          await new Promise<void>((resolve) => {
            const req = window.indexedDB.deleteDatabase(db.name!);
            const timeout = setTimeout(() => resolve(), 3000);
            req.onsuccess = () => { clearTimeout(timeout); resolve(); };
            req.onerror = () => { clearTimeout(timeout); resolve(); };
            req.onblocked = () => { clearTimeout(timeout); resolve(); };
          });
        }
      }
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
        await expect(page.getByTestId('pin-pad-error')).toHaveText(pattern);
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
