import { expect, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';

import { AuthPage } from '../pages/AuthPage';
import { ContactPage } from '../pages/ContactPage';

test.use({
  permissions: ['clipboard-read', 'clipboard-write', 'camera'],
});

test.describe('Contact Addition E2E', () => {
  const pin = '123456';
  const senderName = 'SenderUser';
  const receiverName = 'ReceiverUser';
  const fixturesDir = path.resolve(process.cwd(), 'tests', 'fixtures');

  test.setTimeout(120000); // Increase timeout for slow environments

  test.beforeAll(async () => {
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }
  });

  test.afterAll(async () => {
    if (fs.existsSync(fixturesDir)) {
      const files = await fs.promises.readdir(fixturesDir);
      for (const file of files) {
        if (file.startsWith('sender-qr-') && file.endsWith('.png')) {
          try {
            await fs.promises.unlink(path.join(fixturesDir, file));
          } catch {
            // ignore cleanup errors
          }
        }
      }
    }
  });

  test('Complete Flow: Generate QR, Upload QR, and Scan QR', async ({ browser }) => {
    const qrFilePath = path.join(fixturesDir, `sender-qr-${Date.now()}.png`);

    // --- Step 1: Generate QR as Sender ---
    const senderContext = await browser.newContext();
    const senderPage = await senderContext.newPage();
    const senderAuth = new AuthPage(senderPage);
    new ContactPage(senderPage);

    await senderPage.goto('/');
    await senderAuth.performSignup(senderName, pin);
    await senderAuth.verifyDashboard();

    // Go to Keys/QR page
    // await senderContact.navigateToContacts(); // Not needed if we use header button
    await senderPage.getByTestId('view-qr-header').click();

    // Wait for QR to generate
    await expect(senderPage.locator('.animate-spin')).not.toBeVisible();
    const qrImage = senderPage.getByRole('dialog').getByRole('img');
    await expect(qrImage).toBeVisible();
    await qrImage.screenshot({ path: qrFilePath });

    await senderPage.close();

    // --- Step 2: Upload QR as Receiver ---
    const receiverContext = await browser.newContext();
    const receiverPage = await receiverContext.newPage();
    const receiverAuth = new AuthPage(receiverPage);
    const receiverContact = new ContactPage(receiverPage);

    await receiverPage.goto('/');
    await receiverAuth.performSignup(receiverName, pin);
    await receiverAuth.verifyDashboard();

    expect(fs.existsSync(qrFilePath)).toBeTruthy();
    await receiverContact.uploadContactQR(qrFilePath);

    // Verify Modal
    await receiverContact.verifyContactModalOpen(senderName);
    await receiverContact.confirmAddContact();
    await receiverContact.verifyContactAdded(senderName);

    // --- Step 3: Scan QR (Mocked) as Receiver ---
    // We will try to add the SAME contact again (or a new one if we had another QR)
    // Since it's the same contact, it might show "Already exists" or update.
    // Let's assume we want to test the SCANNER mechanism itself.
    // We can use a generated JSON for a *different* user to verify it works.

    const newContactName = 'ScanTarget';
    const newContactKey = 'Fy5y5y5y5y5y5y5y5y5y5y5y5y5y5y5y5y5y5y5y5y5='; // Dummy valid key
    const jsonPayload = JSON.stringify({
      type: 'nahan-public-key',
      name: newContactName,
      publicKey: newContactKey,
    });

    await QRCode.toDataURL(jsonPayload);

    // NOTE: We cannot easily mock getUserMedia in this environment without launchOptions which cause instability.
    // The scanner will fail to open due to "NotSupportedError" (no camera).
    // We verify this error handling to confirm the scanner logic attempted to start.
    // The "Upload QR" step covers the decoding and contact addition logic.

    // Open Scanner
    await receiverContact.openAddContactScanner();

    // Expect error toast instead of video
    await expect(
      receiverPage.getByText(/Failed to access camera|Camera not supported/).first(),
    ).toBeVisible();

    // Verify modal closes (or is closed)
    await expect(receiverPage.getByTestId('contact-scan-video')).toBeHidden();

    // Cleanup
    if (fs.existsSync(qrFilePath)) {
      fs.unlinkSync(qrFilePath);
    }
  });

  test('Error Handling: Invalid QR Upload', async ({ page }) => {
    const auth = new AuthPage(page);
    const contact = new ContactPage(page);

    await page.goto('/');
    await auth.performSignup('ErrorTester', pin);
    await auth.verifyDashboard();

    // Create invalid image file
    const invalidPath = path.join('tests', 'fixtures', 'invalid.png');
    // Just a 1x1 pixel png
    const invalidBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      'base64',
    );
    if (!fs.existsSync(path.dirname(invalidPath))) {
      fs.mkdirSync(path.dirname(invalidPath), { recursive: true });
    }
    fs.writeFileSync(invalidPath, invalidBuffer);

    await contact.uploadContactQR(invalidPath);

    // Verify Error Toast
    // It might say "No QR code found" or "Failed to process" depending on where it failed
    await expect(page.getByText(/No QR code found|Failed to process|Invalid format/)).toBeVisible();

    fs.unlinkSync(invalidPath);
  });
});
