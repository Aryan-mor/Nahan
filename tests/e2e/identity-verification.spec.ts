/* eslint-disable max-lines-per-function */
import { expect, test } from '@playwright/test';

import { AuthPage } from '../pages/AuthPage';

test.describe('Identity Verification & Sharing', () => {
  let authPage: AuthPage;
  const pin = '123456';
  const name = 'IdentityTester';

  // Grant clipboard permissions
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);
    await page.goto('/');

    // Deterministic Authentication Flow
    // strict check for lock screen visibility without try-catch
    const lockScreen = page.getByTestId('lock-screen-wrapper');
    if (await lockScreen.isVisible()) {
        await authPage.performLogin(pin);
    } else {
        await authPage.performSignup(name, pin);
    }
  });

  test('Verify Identity Copy Methods', async ({ page }) => {
    // 1. Home Page Copy
    await test.step('Home Page Copy', async () => {
      // Ensure we are on home
      await authPage.verifyDashboard();

      const copyBtn = page.getByTestId('copy-identity-home');
      await expect(copyBtn).toBeVisible();
      await copyBtn.click();

      // Verify Clipboard
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      // The copied text is a Stealth ID (poetry + invisible chars)
      // 1. Verify Persian characters (Poetry)
      expect(clipboardText).toMatch(/[\u0600-\u06FF]/);
      // 2. Verify Invisible Unicode Tags (Stealth Payload)
      expect(clipboardText).toMatch(/[\u{E0020}-\u{E007F}]/u);
    });

    // 2. QR Modal via Header
    await test.step('QR Modal via Header', async () => {
        const qrBtn = page.getByTestId('view-qr-header');
        await qrBtn.click();

        // Wait for modal
        const modalCopyBtn = page.getByTestId('copy-identity-modal');
        await expect(modalCopyBtn).toBeVisible();

        // Verify QR Code Canvas/Image existence
        // Wait for spinner to go away (implies QRCode generated)
        await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 10000 });
        const qrImage = page.getByRole('dialog').getByRole('img');
        await expect(qrImage).toBeVisible();

        await modalCopyBtn.click();
        const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
        // Stealth ID check
        expect(clipboardText).toMatch(/[\u0600-\u06FF]/);
        expect(clipboardText).toMatch(/[\u{E0020}-\u{E007F}]/u);

        // Close modal (Click outside or use close button if available, or just press Escape)
        await page.keyboard.press('Escape');
        await expect(modalCopyBtn).toBeHidden();
    });

    // 3. Navigate to Keys Page
    await test.step('Navigate to Keys Page', async () => {
        const keysTab = page.getByTestId('nav-keys-tab');
        await expect(keysTab).toBeVisible();
        await keysTab.click();

        // Wait for Keys page content
        await expect(page.getByTestId('copy-identity-keys')).toBeVisible();

        // 3a. Keys Page Copy
        const keysCopyBtn = page.getByTestId('copy-identity-keys');
        await keysCopyBtn.click();
        // Short wait to ensure clipboard write
        await page.waitForTimeout(100);
        const clipboardKeys = await page.evaluate(() => navigator.clipboard.readText());
        // Stealth ID check
        expect(clipboardKeys).toMatch(/[\u0600-\u06FF]/);
        expect(clipboardKeys).toMatch(/[\u{E0020}-\u{E007F}]/u);

        // 3b. QR Modal via Keys Page
        const keysQrBtn = page.getByTestId('view-qr-keys');
        await keysQrBtn.click();

        // Verify Modal again
        const modalCopyBtn = page.getByTestId('copy-identity-modal');
        await expect(modalCopyBtn).toBeVisible();
        await page.keyboard.press('Escape');
    });
  });
});
