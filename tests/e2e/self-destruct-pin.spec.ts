import { expect, test } from '@playwright/test';
import { AuthPage } from '../pages/AuthPage';

test.describe('Self-Destruct PIN (Emergency Data Wipe)', () => {
  let authPage: AuthPage;
  const MASTER_PIN = '123456';
  const EMERGENCY_PIN = '654321';
  const DIFFERENT_PIN = '111111';

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);

    // Clear State
    await page.goto('/');
    await page.evaluate(async () => {
      // Close existing DB connection
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

    // Perform signup
    await authPage.performSignup('Test User', MASTER_PIN);
    await page.waitForTimeout(2000);
  });

  test('should setup self-destruct PIN successfully', async ({ page }) => {
    // Navigate to Settings
    const settingsTab = page.locator('[data-testid="nav-settings-tab"], [data-testid="nav-mobile-settings-tab"]').first();
    await settingsTab.click();
    await page.waitForTimeout(500);

    // Expand Emergency Data Wipe accordion
    const accordionToggle = page.getByTestId('self-destruct-accordion-toggle');
    await expect(accordionToggle).toBeVisible({ timeout: 10000 });

    // Scroll into view to ensure it's clickable
    await accordionToggle.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    await accordionToggle.click();
    await page.waitForTimeout(500);

    // Verify initial status
    await expect(page.getByTestId('self-destruct-status')).toContainText(/No emergency PIN configured/i);

    // Click Setup button
    const setupButton = page.getByTestId('setup-self-destruct-button');
    await expect(setupButton).toBeVisible();
    await setupButton.click();

    // Modal should open
    await expect(page.getByTestId('self-destruct-modal')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('self-destruct-modal-header')).toBeVisible();
    await expect(page.getByTestId('self-destruct-warning-banner')).toBeVisible();

    // Enter emergency PIN
    await authPage.enterPin(EMERGENCY_PIN);
    await page.waitForTimeout(500);

    // Confirm emergency PIN (Modal header or labels might change, but PinPad is main)
    await authPage.enterPin(EMERGENCY_PIN);

    // Modal should close
    await expect(page.getByTestId('self-destruct-modal')).not.toBeVisible({ timeout: 10000 });

    // Verify status updated
    await expect(page.getByTestId('self-destruct-status')).toContainText(/Emergency PIN is configured/i);
  });

  test('should validate PIN requirements', async ({ page }) => {
    // Navigate to Settings and open setup
    const settingsTab = page.locator('[data-testid="nav-settings-tab"], [data-testid="nav-mobile-settings-tab"]').first();
    await settingsTab.click();
    await page.waitForTimeout(500);

    const accordionToggle = page.getByTestId('self-destruct-accordion-toggle');
    await accordionToggle.scrollIntoViewIfNeeded();
    await accordionToggle.click();
    await page.waitForTimeout(500);

    const setupButton = page.getByTestId('setup-self-destruct-button');
    await setupButton.click();

    // Wait for modal to be visible
    await expect(page.getByTestId('self-destruct-modal')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);

    // Try to use master PIN as emergency PIN
    await authPage.enterPin(MASTER_PIN);
    await page.waitForTimeout(1000);

    // Error message should be visible on pin pad
    await expect(page.locator('[data-testid="pin-pad-error"]')).toBeVisible({ timeout: 10000 });

    // PIN should be cleared, enter different PIN
    await authPage.enterPin(DIFFERENT_PIN);
    await page.waitForTimeout(1000);

    // Try to confirm with wrong PIN
    await authPage.enterPin('222222');
    await page.waitForTimeout(1000);

    // Verify mismatch error
    await expect(page.locator('[data-testid="pin-pad-error"]')).toBeVisible({ timeout: 10000 });
  });

  test('should trigger data wipe when emergency PIN is entered on lock screen', async ({ page }) => {
    // Setup emergency PIN first
    const settingsTab = page.locator('[data-testid="nav-settings-tab"], [data-testid="nav-mobile-settings-tab"]').first();
    await settingsTab.click();
    await page.waitForTimeout(500);

    const accordionToggle = page.getByTestId('self-destruct-accordion-toggle');
    await accordionToggle.scrollIntoViewIfNeeded();
    await accordionToggle.click();
    await page.waitForTimeout(300);

    const setupButton = page.getByTestId('setup-self-destruct-button');
    await setupButton.click();

    // Setup emergency PIN
    await authPage.enterPin(EMERGENCY_PIN);
    await page.waitForTimeout(500);
    await authPage.enterPin(EMERGENCY_PIN);

    // Wait for modal to close
    await expect(page.getByTestId('self-destruct-modal')).not.toBeVisible({ timeout: 10000 });

    // Lock the app by reloading
    await page.reload();
    const lockScreen = page.locator('[data-testid="lock-screen-wrapper"]');
    await expect(lockScreen).toBeVisible();

    // Enter emergency PIN
    await authPage.enterPin(EMERGENCY_PIN, lockScreen);

    // Wait for wipe and reload to welcome screen
    await expect(
      page.locator('[data-testid="welcome-start-button"], [data-testid="lang-en-btn"]').first()
    ).toBeVisible({ timeout: 60000 });

    // Verify data is wiped by checking IndexedDB
    const isDataWiped = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const req = indexedDB.open('nahan');
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('secure_vault')) {
              resolve(true); // Wiped
              return;
          }
          const tx = db.transaction(['secure_vault', 'system_settings'], 'readonly');
          const vaultStore = tx.objectStore('secure_vault');
          const settingsStore = tx.objectStore('system_settings');

          const vaultCount = vaultStore.count();
          const settingsCount = settingsStore.count();

          Promise.all([
            new Promise((res) => { vaultCount.onsuccess = () => res(vaultCount.result); }),
            new Promise((res) => { settingsCount.onsuccess = () => res(settingsCount.result); })
          ]).then(([vault, settings]) => {
            db.close();
            resolve(vault === 0 && settings === 0);
          });
        };
        req.onerror = () => resolve(true); // DB doesn't exist = wiped
      });
    });

    expect(isDataWiped).toBe(true);
  });

  test('should persist emergency PIN across lock/unlock cycles', async ({ page }) => {
    // Setup emergency PIN
    const settingsTab = page.locator('[data-testid="nav-settings-tab"], [data-testid="nav-mobile-settings-tab"]').first();
    await settingsTab.click();
    await page.waitForTimeout(500);

    const accordionToggle = page.getByTestId('self-destruct-accordion-toggle');
    await accordionToggle.scrollIntoViewIfNeeded();
    await accordionToggle.click();
    await page.waitForTimeout(500);

    const setupButton = page.getByTestId('setup-self-destruct-button');
    await setupButton.click();

    // Wait for modal
    await expect(page.getByTestId('self-destruct-modal')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);

    await authPage.enterPin(EMERGENCY_PIN);
    await page.waitForTimeout(1000);
    await authPage.enterPin(EMERGENCY_PIN);

    // Wait for modal to close
    await expect(page.getByTestId('self-destruct-modal')).not.toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);

    // Lock and unlock with master PIN
    await page.reload();
    await authPage.performLogin(MASTER_PIN);

    // Navigate back to Settings
    await settingsTab.click();
    await page.waitForTimeout(1000);
    await accordionToggle.scrollIntoViewIfNeeded();
    await accordionToggle.click();
    await page.waitForTimeout(500);

    // Verify emergency PIN is still configured
    await expect(page.getByTestId('self-destruct-status')).toContainText(/Emergency PIN is configured/i, { timeout: 10000 });
  });

  test('should remove emergency PIN successfully', async ({ page }) => {
    // Setup emergency PIN
    const settingsTab = page.locator('[data-testid="nav-settings-tab"], [data-testid="nav-mobile-settings-tab"]').first();
    await settingsTab.click();
    await page.waitForTimeout(500);

    const accordionToggle = page.getByTestId('self-destruct-accordion-toggle');
    await accordionToggle.scrollIntoViewIfNeeded();
    await accordionToggle.click();
    await page.waitForTimeout(300);

    const setupButton = page.getByTestId('setup-self-destruct-button');
    await setupButton.click();

    await authPage.enterPin(EMERGENCY_PIN);
    await page.waitForTimeout(500);
    await authPage.enterPin(EMERGENCY_PIN);

    // Wait for modal to close
    await expect(page.getByTestId('self-destruct-modal')).not.toBeVisible({ timeout: 10000 });

    // Verify it's configured
    await expect(page.getByTestId('self-destruct-status')).toContainText(/Emergency PIN is configured/i);

    // Click Remove button
    const removeButton = page.getByTestId('remove-self-destruct-button');
    await expect(removeButton).toBeVisible();
    await removeButton.click();

    // Verify status updated
    await expect(page.getByTestId('self-destruct-status')).toContainText(/No emergency PIN configured/i);
  });
});
