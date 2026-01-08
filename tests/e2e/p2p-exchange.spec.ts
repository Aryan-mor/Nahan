/* eslint-disable max-lines-per-function */
import { BrowserContext, Page, expect, test } from '@playwright/test';

import { AuthPage } from '../pages/AuthPage';
import { ContactPage } from '../pages/ContactPage';

test.describe('P2P Messaging (Multi-User)', () => {
    let contextA: BrowserContext;
    let contextB: BrowserContext;
    let pageA: Page;
    let pageB: Page;
    let authPageA: AuthPage;
    let authPageB: AuthPage;
    let contactPageB: ContactPage;

    const pin = '123456';
    const userAName = 'UserA_Sender';
    const userBName = 'UserB_Receiver';

    test.beforeEach(async ({ browser }) => {
        // User A (Sender): Grant Clipboard Permissions
        contextA = await browser.newContext({
            permissions: ['clipboard-read', 'clipboard-write'],
        });
        pageA = await contextA.newPage();
        authPageA = new AuthPage(pageA);

        // User B (Receiver): DENY Clipboard Read (Manual Fallback Test) but ALLOW Write for Copy
        contextB = await browser.newContext({
            permissions: ['clipboard-write'],
        });
        pageB = await contextB.newPage();
        authPageB = new AuthPage(pageB);
        contactPageB = new ContactPage(pageB);

        // Initial Navigation
        await pageA.goto('/');
        await pageB.goto('/');
    });

    test.afterEach(async () => {
        await contextA.close();
        await contextB.close();
    });

    test('P2P Exchange: Manual Entry (B adds A) & Auto-Detect (A adds B)', async () => {
        test.setTimeout(120000); // 120s timeout for heavy P2P flow
        // 1. Authenticate Both Users
        await test.step('Authenticate Users', async () => {
            await Promise.all([
                authPageA.performSignup(userAName, pin),
                authPageB.performSignup(userBName, pin),
            ]);
        });

        let userAStealthId = '';

        // 2. User A (With Perms) Copies Identity
        await test.step('User A Copies Identity', async () => {
            await authPageA.verifyDashboard();
            // Click Copy
            await pageA.getByTestId('copy-identity-home').click();

            // Verify Clipboard Content (User A has permission)
            userAStealthId = await pageA.evaluate(() => navigator.clipboard.readText());
            expect(userAStealthId).toMatch(/[\u0600-\u06FF]/); // Persian Check
        });

        // 3. User B (No Perms) Adds User A Manually
        await test.step('User B Manual Add (Fallback)', async () => {
             // Ensure B is on dashboard
            await authPageB.verifyDashboard();

            // User B cannot read clipboard. Must manually paste
            await contactPageB.openAddContactManual();

            // Fill and Decode
            await contactPageB.fillManualContact(userAStealthId);

            // Expect Detection Modal to appear (Universal Flow)
            const detectionModal = pageB.getByTestId('detection-modal');
            await expect(detectionModal).toBeVisible();

            // Click Add in Detection Modal
            const addBtn = pageB.getByTestId('detection-add-contact-btn');
            await addBtn.click();

            // Wait for handling
            await expect(detectionModal).toBeHidden();

            // Verify
            await contactPageB.verifyContactAdded(userAName);
        });

        // 4. User A Adds User B (Auto-Detect Flow)
        await test.step('User A Auto-Detects User B', async () => {
            // First, get B's ID (Simulate B sending it to A)
            // Open modal to ensure generation is standard
            await pageB.getByTestId('view-qr-header').click({ force: true });

            // Extract using clipboard write interception (User B has clipboard-write)
            const userBStealthId = await pageB.evaluate(async () => {
                 let txt = '';
                 const original = navigator.clipboard.writeText;
                 navigator.clipboard.writeText = async (t) => { txt = t; };
                 // Perform Click
                 document.querySelector<HTMLElement>('[data-testid="copy-identity-home"]')?.click();
                 // Restore
                 navigator.clipboard.writeText = original;
                 return txt;
            });

            // Now A puts it in clipboard (Real World: Copied from chat app)
            await pageA.evaluate((text) => navigator.clipboard.writeText(text), userBStealthId);

            // Close QR Modal on B to prevent blocking UI in Step 5
            await pageB.keyboard.press('Escape');
            // Wait for modal to disappear to ensure clickability later
            await expect(pageB.locator('div[data-slot="wrapper"]')).toBeHidden();

            // A focuses app (Trigger 'focus' event for auto-detect logic in App.tsx)
            await pageA.getByTestId('nav-chats-tab').click();
            await pageA.bringToFront();

            // Mock document properties to force "Visible" and "Focused" state
            await pageA.addInitScript(() => {
                Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
                Object.defineProperty(document, 'hidden', { value: false, writable: true });
                document.hasFocus = () => true;
            });

            // Dispatch focus events
            await pageA.evaluate(() => {
                window.dispatchEvent(new Event('focus'));
                document.dispatchEvent(new Event('visibilitychange'));
            });

            // Verify Detection Toast (Strict Check: No try-catch)
            // Wait for modal to appear
            await expect(pageA.getByTestId('detection-modal')).toBeVisible({ timeout: 10000 });

            // Click "Add Contact" (or "Add Chat") in the modal
            const addContactBtn = pageA.getByTestId('detection-add-contact-btn');
            await expect(addContactBtn).toBeVisible();
            await addContactBtn.click();

            // MANDATORY: Wait for modal to handle IDB transaction and close
            await expect(pageA.getByTestId('detection-modal')).toBeHidden();
        });

        // 5. Verify Bi-Directional Connection
        await test.step('Verify Contacts Linked', async () => {
            // Clear any potential modals/overlays
            await pageA.keyboard.press('Escape');
            await pageB.keyboard.press('Escape');

            // Ensure both are on the Chats tab where contacts/chats are listed
            await pageA.getByTestId('nav-chats-tab').click({ force: true });
            await pageB.getByTestId('nav-chats-tab').click({ force: true });

            // Verify names appear in the chat list using strict test IDs
            // Use .first() in case of multiple calls, but ID should be unique enough
            // Increase timeout to allow for IDB decryption/loading after unlock
            await expect(pageA.getByTestId(`chat-item-${userBName}`).first()).toBeVisible({ timeout: 30000 });
            await expect(pageB.getByTestId(`chat-item-${userAName}`).first()).toBeVisible({ timeout: 30000 });
        });
    });
});
