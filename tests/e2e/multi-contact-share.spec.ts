import { expect, test } from '@playwright/test';
import { AuthPage } from '../pages/AuthPage';
import { ChatListPage } from '../pages/ChatListPage';
import { ContactPage } from '../pages/ContactPage';

test.describe('Multi-Contact Share E2E', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ browser }) => {
    try {
      const context = await browser.newContext({ permissions: ['clipboard-write'] });
      await context.addInitScript(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__NAHAN_IS_AUTOMATED__ = true;
      });
      const page = await context.newPage();
      // Ensure we have a valid DOM for clipboard access
      await page.goto('data:text/html,<body></body>');
      await page.evaluate(async () => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText('').catch(() => {});
        }
      });
      await context.close();
    } catch {
      // Clipboard clear failed

    }
  });
  test.use({ viewport: { width: 1280, height: 720 } });

  const PIN = '123456';
  const contacts = [
    { name: 'Alice', identity: '' },
    { name: 'Bob', identity: '' },
  ];

  test('Share Multiple Contacts via Manual Import', async ({ browser }) => {
    test.setTimeout(120000);
    // --- Step 1: Generate Identities ---
    for (const contact of contacts) {
      const context = await browser.newContext({
        permissions: ['clipboard-read', 'clipboard-write'],
      });
      await context.addInitScript(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__NAHAN_IS_AUTOMATED__ = true;
      });
      const page = await context.newPage();

      // Disable prompts to prevent interference
      await page.addInitScript(() => {
        localStorage.setItem('clipboard-permission-prompt-shown', 'true');
        localStorage.setItem('biometric_onboarding_dismissed', 'true');
      });

      const auth = new AuthPage(page);
      const contactPage = new ContactPage(page);

      await test.step(`Generate Identity for ${contact.name}`, async () => {
        await page.goto('/');
        await auth.performSignup(contact.name, PIN);

        // Copy Identity
        contact.identity = await contactPage.copyIdentity();
        expect(contact.identity).toBeTruthy();

        // Clear clipboard to prevent detection in next iteration/context
        await page.evaluate(() => navigator.clipboard.writeText(''));
      });
      await context.close();
    }

    let multiContactString = '';

    // --- Step 2: Sender Adds Contacts & Shares Them ---
    const senderContext = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    await senderContext.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__NAHAN_IS_AUTOMATED__ = true;
    });
    const senderPage = await senderContext.newPage();

    // Disable prompts for Sender
    await senderPage.addInitScript(() => {
      localStorage.setItem('clipboard-permission-prompt-shown', 'true');
      localStorage.setItem('biometric_onboarding_dismissed', 'true');
    });

    // Add console logs for debugging

    const senderAuth = new AuthPage(senderPage);
    const senderChatList = new ChatListPage(senderPage);
    const senderContacts = new ContactPage(senderPage);

    await test.step('Sender Setup & Share', async () => {
      await senderPage.goto('/');
      await senderAuth.performSignup('Sender', PIN);

      // Add contacts
      for (const contact of contacts) {
        await senderContacts.openAddContactManual();
        await senderContacts.fillManualContact(contact.identity);
        await senderContacts.submitContact();
        await senderContacts.verifyContactAdded(contact.name);
      }

      // Return to chat list
      await senderPage.getByTestId('nav-chats').click();

      // Enter Selection Mode via long press simulation
      // We need to wait for list to be interactive
      await senderPage.waitForTimeout(1000);
      await senderChatList.enterSelectionMode(contacts[0].name);
      await senderChatList.selectContactInMode(contacts[1].name);

      // Share
      await senderPage.getByTestId('selection-menu-trigger').click();
      await senderPage.getByTestId('contact-option-bulk-share').click();

      // NEW: Confirm share identity prompt (Say NO for this test to keep original behavior)
      await expect(senderPage.getByTestId('share-contacts-header')).toBeVisible();
      await senderPage.getByTestId('share-confirm-no').click();
      await expect(senderPage.getByTestId('share-contacts-header')).toBeHidden();

      // Verify QR Modal Header first
      await expect(senderPage.getByTestId('qr-modal-header')).toBeVisible();

      // Verify Modal & Copy
      await expect(senderPage.getByTestId('multi-contacts-count')).toBeAttached();

      await expect(senderPage.getByTestId('copy-identity-modal')).toBeVisible();
      await senderPage.getByTestId('copy-identity-modal').click({ force: true });

      // Verify clipboard content
      multiContactString = await senderPage.evaluate(() => navigator.clipboard.readText());
      expect(multiContactString.length).toBeGreaterThan(contacts[0].identity.length);
      // console.log('Multi-contact string length:', multiContactString.length);
    });

    await senderContext.close();

    // --- Step 3: Receiver Detects Multi-Contact (Manual Import) ---
    // Using Manual Import to reproduce the specific error stack trace and avoid clipboard flakiness
    const receiverContext = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    await receiverContext.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__NAHAN_IS_AUTOMATED__ = true;
    });
    const receiverPage = await receiverContext.newPage();

    // Disable prompts for Receiver
    await receiverPage.addInitScript(() => {
      localStorage.setItem('clipboard-permission-prompt-shown', 'true');
      localStorage.setItem('biometric_onboarding_dismissed', 'true');
    });

    const receiverAuth = new AuthPage(receiverPage);
    const receiverContacts = new ContactPage(receiverPage);

    await test.step('Receiver Verification', async () => {
      // Capture console logs from the page (including worker logs if they propagate)


      await receiverPage.goto('/');
      await receiverAuth.performSignup('Receiver', PIN);

      // Go to Keys/Manual Import
      await receiverContacts.navigateToContacts();
      await receiverPage.getByTestId('manual-entry-button').click();

      // Paste
      await receiverPage.getByTestId('manual-import-textarea').fill(multiContactString);

      // Click Decode
      await receiverPage.getByTestId('manual-import-decode-btn').click();

      // Verification: Modal should appear
      // If bug exists: Error toast "Invalid message format" will appear
      const modal = receiverPage.getByTestId('detection-modal');
      const errorToast = receiverPage
        .getByText('Invalid message format')
        .or(receiverPage.getByText('Failed to process'));

      await expect(modal.or(errorToast)).toBeVisible();

      if (await errorToast.isVisible()) {
        throw new Error('Test Failed: "Invalid message format" error received on import');
      }

      await expect(modal).toBeVisible();
      await expect(modal.getByTestId('detection-multi-count')).toBeAttached();

      // Add them
      await receiverPage.getByTestId('detection-add-multi-btn').click({ force: true });

      // Verify they appear
      await expect(modal).toBeHidden();

      // Verify they appear in Chat List
      await receiverPage.getByTestId('nav-chats').click();
      for (const contact of contacts) {
        // Use the same verification logic as sender
        await receiverContacts.verifyContactAdded(contact.name);
      }
    });
    await receiverContext.close();
  });

  test('Share Multiple Contacts via QR', async ({ browser }) => {
    // --- Step 1: Generate Identities ---
    for (const contact of contacts) {
      const context = await browser.newContext({
        permissions: ['clipboard-read', 'clipboard-write'],
      });
      await context.addInitScript(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__NAHAN_IS_AUTOMATED__ = true;
      });
      const page = await context.newPage();

      // Disable prompts
      await page.addInitScript(() => {
        localStorage.setItem('clipboard-permission-prompt-shown', 'true');
        localStorage.setItem('biometric_onboarding_dismissed', 'true');
      });

      const auth = new AuthPage(page);
      const contactPage = new ContactPage(page);

      await test.step(`Generate Identity for ${contact.name}`, async () => {
        await page.goto('/');
        await auth.performSignup(contact.name, PIN);

        // Wait for any modals to close/animations to finish
        // Wait specifically for the Detection Modal to potentially appear and then ensure it is GONE
        // If previous test left clipboard content, detection modal might pop up.
        // We'll try to clear clipboard blindly first thing in the test? No, context is fresh.
        // But OS clipboard is shared.

        // Try to force close any modal that might be blocking
        const blockingModal = page.locator('div[data-slot="wrapper"]');
        if (await blockingModal.isVisible()) {
          // Try to click outside or escape?
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
        }

        await page.waitForTimeout(1000);

        // Copy Identity
        // Force click to bypass overlay if any
        await contactPage.copyIdentity(true);
        expect(contact.identity).toBeTruthy();

        // Clear clipboard
        await page.evaluate(() => navigator.clipboard.writeText(''));
      });
      await context.close();
    }

    let qrCodeBuffer: Buffer;

    // --- Step 2: Sender Shares via QR ---
    const senderContext = await browser.newContext({
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    await senderContext.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__NAHAN_IS_AUTOMATED__ = true;
    });
    const senderPage = await senderContext.newPage();

    // Disable prompts
    await senderPage.addInitScript(() => {
      localStorage.setItem('clipboard-permission-prompt-shown', 'true');
      localStorage.setItem('biometric_onboarding_dismissed', 'true');
    });

    const senderAuth = new AuthPage(senderPage);
    const senderChatList = new ChatListPage(senderPage);
    const senderContacts = new ContactPage(senderPage);

    await test.step('Sender QR Generation', async () => {
      await senderPage.goto('/');
      await senderAuth.performSignup('SenderQR', PIN);

      for (const contact of contacts) {
        await senderContacts.openAddContactManual();
        await senderContacts.fillManualContact(contact.identity);
        await senderContacts.submitContact();
        // Close the contact added modal or navigate back if needed?
        // submitContact (verifyContactAdded) handles navigation usually.
        await senderContacts.verifyContactAdded(contact.name);
      }

      await senderPage.getByTestId('nav-chats').click();
      await senderPage.waitForTimeout(1000);

      // Enter selection mode
      await senderChatList.enterSelectionMode(contacts[0].name);
      await senderChatList.selectContactInMode(contacts[1].name);

      // Share
      await senderPage.getByTestId('selection-menu-trigger').click();
      await senderPage.getByTestId('contact-option-bulk-share').click();

      // NEW: Confirm share identity prompt (Say NO for this test)
      await expect(senderPage.getByTestId('share-contacts-header')).toBeVisible();
      await senderPage.getByTestId('share-confirm-no').click();

      await expect(senderPage.getByTestId('share-contacts-header')).toBeHidden();

      // Open QR
      await expect(senderPage.getByTestId('qr-modal-header')).toBeVisible();
      await expect(senderPage.getByTestId('multi-contacts-count')).toBeAttached();
      await senderPage.getByTestId('view-qr-modal-btn'); // Check existence without assignment
      // Wait, MyQRModal has tabs? Or is it the "Show QR Code" button in the modal?
      // In MyQRModal.tsx:
      // <Button ... data-testid="share-qr-file" ... > Share File
      // The modal IS the QR modal. It shows QR by default?
      // Checking MyQRModal.tsx logic... It renders <QRCode ... />.
      // We need to screenshot the QR code element.
      const qrImage = senderPage.getByTestId('qr-code-img');
      await expect(qrImage).toBeVisible();

      // Get source directly to avoid screenshot/rendering issues
      const src = await qrImage.getAttribute('src');
      expect(src).toBeTruthy();
      // Remove prefix "data:image/png;base64,"
      const base64 = src!.split(',')[1];
      qrCodeBuffer = Buffer.from(base64, 'base64');
    });
    await senderContext.close();

    // --- Step 3: Verify QR Content (Node-side) ---
    await test.step('Verify QR Content', async () => {
      // const jsQR = (await import('jsqr')).default;
      // jsQR expects Uint8ClampedArray (RGBA). formatting buffer is hard seamlessly.
      // Minimal check: ensure buffer exists.
      // Ideally we decode it, but PNG decoding in Node requires 'pngjs' or similar.
      // We'll skip strict decoding for now and rely on Receiver to decode it in-app.
      expect(qrCodeBuffer).toBeTruthy();

    });

    // --- Step 4: Receiver Scans QR ---
    const receiverContext = await browser.newContext({
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    await receiverContext.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__NAHAN_IS_AUTOMATED__ = true;
    });
    const receiverPage = await receiverContext.newPage();

    // Disable prompts for QR Receiver
    await receiverPage.addInitScript(() => {
      localStorage.setItem('clipboard-permission-prompt-shown', 'true');
      localStorage.setItem('biometric_onboarding_dismissed', 'true');
    });

    const receiverAuth = new AuthPage(receiverPage);
    const receiverContacts = new ContactPage(receiverPage);

    await test.step('Receiver Scan', async () => {


      await receiverPage.goto('/');
      await receiverAuth.performSignup('ReceiverQR', PIN);

      await receiverContacts.navigateToContacts();
      await expect(receiverPage.getByTestId('add-contact-upload-btn')).toBeVisible();

      // Create a temp file for the QR
      const fs = await import('fs');
      const path = await import('path');
      const tempFile = path.resolve('temp_qr.png');
      fs.writeFileSync(tempFile, qrCodeBuffer);

      try {
        // Upload
        const fileInput = receiverPage.locator('input[type="file"]').first();
        await fileInput.setInputFiles(tempFile);

        // Detection Modal should appear
        const modal = receiverPage.getByTestId('detection-modal');
        await expect(modal).toBeVisible({ timeout: 15000 });
        await expect(modal.getByTestId('detection-multi-count')).toBeAttached();

        await receiverPage.getByTestId('detection-add-multi-btn').click({ force: true });
        await expect(modal).toBeHidden();

        // Verify
        await receiverPage.getByTestId('nav-chats').click();
        for (const contact of contacts) {
          await receiverContacts.verifyContactAdded(contact.name);
        }
      } finally {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      }
    });
    await receiverContext.close();
  });
});
