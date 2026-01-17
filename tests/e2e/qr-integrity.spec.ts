
import { expect, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';

import { AuthPage } from '../pages/AuthPage';

test.describe('QR Code Integrity & Decoding', () => {
  let authPage: AuthPage;
  const pin = '123456';
  const name = 'IdentityTester';

  // Read jsQR library from node_modules for injection
  const jsQrPath = path.join(process.cwd(), 'node_modules/jsqr/dist/jsQR.js');
  const jsQrLib = fs.readFileSync(jsQrPath, 'utf-8');

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);
    await page.goto('/');

    const lockScreen = page.getByTestId('lock-screen-wrapper');
    if (await lockScreen.isVisible()) {
      await authPage.performLogin(pin);
    } else {
      await authPage.performSignup(name, pin);
    }
  });

  test('Should encode valid Stealth ID with Unicode Tags', async ({ page }) => {
    // 1. Open QR Modal
    await authPage.verifyDashboard();
    await page.getByTestId('view-qr-header').click();

    // 2. Wait for QR Code Generation
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 10000 });
    const qrImage = page.getByRole('dialog').getByRole('img');
    await expect(qrImage).toBeVisible();

    // 3. Inject jsQR Library
    await page.addScriptTag({ content: jsQrLib });

    // 4. Capture and Decode QR in Browser Context
    // Pass the image element directly from the locator to ensure we have the right node
    const decodedData = await qrImage.evaluate(async (img: HTMLImageElement) => {
      // Create canvas to extract pixel data
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get 2D context');

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Decode using the injected jsQR global
      // @ts-expect-error jsQR is injected globally
      const code = window.jsQR(imageData.data, imageData.width, imageData.height);

      if (!code) return null;
      return code.data;
    });

    // 5. Verify Content
    expect(decodedData).not.toBeNull();

    // 6. Strict Stealth ID Validation
    // A. Must contain Persian Poetry (Visible Cover)
    expect(decodedData).toMatch(/[\u0600-\u06FF]/);

    // B. Must contain Invisible Unicode Tags (Stealth Payload)
    // This proves the QR code actually carries the keys, not just the cover text.
    expect(decodedData).toMatch(/[\u{E0020}-\u{E007F}]/u);
  });
});
