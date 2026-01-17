
import { Browser, BrowserContext, Page, expect, test } from '@playwright/test';
import { AuthPage } from '../pages/AuthPage';
import { ContactPage } from '../pages/ContactPage';

export interface P2PUser {
  context: BrowserContext;
  page: Page;
  authPage: AuthPage;
  contactPage: ContactPage;
  name: string;
  pin: string;
  stealthId?: string;
}

export interface P2PSetupResult {
  userA: P2PUser;
  userB: P2PUser;
}

export async function setupConnectedUsers(browser: Browser): Promise<P2PSetupResult> {
  const userAName = 'UserA_' + Date.now();
  const userBName = 'UserB_' + Date.now();
  const userAPin = '123456';
  const userBPin = '654321';

  // =========================================================================
  // 1. Context Creation
  // =========================================================================

  // User A: Initially NO permissions (Simulating fresh install).
  // We will grant them mid-test to simulate the "Grant Permission" flow.
  const contextA = await browser.newContext({
    permissions: [], // Start clean
  });
  const pageA = await contextA.newPage();

  // User B: Write OK, Read DENIED.
  // We explicitly grant write, but leave read denied/prompt.
  const contextB = await browser.newContext({
    permissions: ['clipboard-write'],
  });
  const pageB = await contextB.newPage();

  // Mock Clipboard Denial for User B (Native denial simulation)
  await pageB.addInitScript(() => {
    // We wrap the navigator.clipboard to enforce failure for READ operations
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const originalReadText = navigator.clipboard.readText;

    Object.defineProperty(navigator.clipboard, 'readText', {
      writable: true,
      value: async () => {
        // Simulate browser denial
        return Promise.reject(new Error('Read permission denied'));
      },
    });
  });

  const authPageA = new AuthPage(pageA);
  const contactPageA = new ContactPage(pageA);
  const authPageB = new AuthPage(pageB);
  const contactPageB = new ContactPage(pageB);

  // Initial Navigation
  await pageA.goto('/');
  await pageB.goto('/');

  // =========================================================================
  // 2. Authentication (Steps 1 & 3 in User Plan)
  // =========================================================================
  await test.step('Setup: Authenticate Users', async () => {
    await Promise.all([
      authPageA.performSignup(userAName, userAPin),
      authPageB.performSignup(userBName, userBPin),
    ]);
  });

  // =========================================================================
  // 3. User A: Grant Clipboard Permission (Step 2)
  // =========================================================================
  await test.step('Setup: User A Grants Clipboard Permission', async () => {
    // Navigate to Settings
    await pageA.getByTestId('nav-settings-tab').click();

    // Click "Allow Access" to open modal
    // Note: Component uses text "Allow Access" (key: settings.general.clipboard.grant_button)
    await pageA.getByRole('button', { name: /Allow Access/i }).click();

    // In Modal, Click "Grant Permission"
    // Key: clipboard.permission.grant -> "Grant Permission" (or similar)
    // We'll look for the primary button in the modal footer
    const grantBtn = pageA.getByRole('dialog').getByRole('button').filter({ hasText: /Grant/i });
    await expect(grantBtn).toBeVisible();

    // SIMULATION: Calling Playwright grantPermissions BEFORE clicking logic triggers
    // to ensure the application sees "Granted" immediately after the "browser prompt" which we skip.
    // In reality: User clicks -> Browser Prompt -> User clicks Allow -> navigator.permissions changes.
    // Playwright: update permissions -> click button (app logic runs request -> gets yes).
    await contextA.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Force click if overlay intercepts
    await grantBtn.click({ force: true });

    // Verify "Allow Access" button is gone or UI reflects granted state
    await expect(pageA.getByRole('button', { name: /Allow Access/i })).toBeHidden();

    // Ensure Modal is completely gone (wait for animation)
    try {
      await expect(pageA.getByRole('dialog')).toBeHidden({ timeout: 5000 });
    } catch {
      // If still visible, try Escape (fallback)
      await pageA.keyboard.press('Escape');
      await expect(pageA.getByRole('dialog')).toBeHidden();
    }

    // Return to Chat List
    await pageA.getByTestId('nav-chats-tab').click({ force: true });
  });

  // =========================================================================
  // 4. User B: Deny/Skip Clipboard Permission (Step 4)
  // =========================================================================
  await test.step('Setup: User B Skips Clipboard Permission', async () => {
    // Navigate to Settings
    await pageB.getByTestId('nav-settings-tab').click();

    // Click "Allow Access"
    await pageB.getByRole('button', { name: /Allow Access/i }).click();

    // In Modal, Click "Not Now"
    // Key: clipboard.permission.not_now -> "Not Now"
    await pageB.getByRole('button', { name: /Not Now/i }).click();

    // Modal closed
    await expect(pageB.getByRole('dialog')).toBeHidden();

    // Button should still be visible because we didn't grant it
    await expect(pageB.getByRole('button', { name: /Allow Access/i })).toBeVisible();

    // Return to Chat List
    await pageB.getByTestId('nav-chats-tab').click();
  });

  // =========================================================================
  // 5. User B copies Identity (Step 5)
  // =========================================================================
  // Note: B uses Manual connection, so we need B's ID to give to A.
  // The user flow says "UserB click on 'Copy Identity' ... UserA detects".
  // So B is the Passive one here? "UserB click... to his code stored to clipboard".
  // A detects.

  // We need to capture B's ID.
  // Since B's clipboard write works, we can intercept it or just read from UI if possible.
  // Intercept method is reliable.
  const userBStealthId = await test.step('Setup: User B Copy Identity', async () => {
    // Go back to list if not there? (Already done in step 4)

    // Intercept writeText
    return await pageB.evaluate(async () => {
      return new Promise<string>((resolve) => {
        const original = navigator.clipboard.writeText;
        // @ts-expect-error - Mocking
        navigator.clipboard.writeText = async (t) => {
          resolve(t);
          // Restore immediately
          navigator.clipboard.writeText = original;
        };
        // Perform Click
        const btn = document.querySelector<HTMLElement>('[data-testid="copy-identity-home"]');
        if (!btn) throw new Error('Copy button not found');
        btn.click();
      });
    });
  });

  // =========================================================================
  // 6. User A Auto-Detects User B (Step 6)
  // =========================================================================
  await test.step('Setup: User A Auto-Detects User B', async () => {
    // Simulate A having B's ID in clipboard
    // Since we are cross-context, we Must manually "paste" into A's mock clipboard or logic.
    // But A has REAL clipboard permission now.
    // We can use page.evaluate to write to A's clipboard using the API (since we granted 'clipboard-write').
    await pageA.evaluate(async (text) => {
      await navigator.clipboard.writeText(text);
    }, userBStealthId);

    // Trigger detection (Focus/Visibility)
    await pageA.evaluate(() => {
      window.dispatchEvent(new Event('focus'));
      Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Wait for Modal "New Contact Detected"
    await expect(pageA.getByTestId('detection-modal')).toBeVisible({ timeout: 15000 });

    // Click "Add & Start Chat"
    // ID verified in previous run: 'detection-add-contact-btn'
    await pageA.getByTestId('detection-add-contact-btn').click();

    // Verify User A is in Single Chat Page
    await expect(pageA.getByTestId('chat-view-container')).toBeVisible();
  });

  // =========================================================================
  // 7. User A Back to List (Step 7)
  // =========================================================================
  await test.step('Setup: User A Back to List', async () => {
    await pageA.getByTestId('back-to-list-btn').click();
    await expect(pageA.getByTestId('chat-view-container')).toBeHidden();
  });

  // =========================================================================
  // 8. User A Copies Identity (Step 8)
  // =========================================================================
  // We need A's ID for B to paste.
  const userAStealthId = await test.step('Setup: User A Copy Identity', async () => {
    // Intercept or use page.evaluate readText (since A has permission)
    // Let's use readText for realism since A has permission.
    await pageA.getByTestId('copy-identity-home').click();
    return await pageA.evaluate(async () => await navigator.clipboard.readText());
  });

  // =========================================================================
  // 9. User B Manual Paste (Steps 9, 10, 11)
  // =========================================================================
  await test.step('Setup: User B Manual Paste', async () => {
    // Click "chat-list-manual-paste-icon"
    // This fails to read clipboard (User B denied), so opens ManualPasteModal.
    await pageB.getByTestId('chat-list-manual-paste-icon').click();

    // Verify Manual Input Modal is Open
    // Selector: 'manual-import-textarea' (from ManualPasteModal or reusable component)
    const input = pageB.getByTestId('manual-import-textarea');
    await expect(input).toBeVisible();

    // Paste User A's ID
    await input.fill(userAStealthId);

    // Click "Import & Decode"
    // Selector: 'manual-import-decode-btn'
    const decodeBtn = pageB.getByTestId('manual-import-decode-btn');
    await expect(decodeBtn).toBeEnabled();
    await decodeBtn.click();

    // "New Contact Detected" Modal appears
    await expect(pageB.getByTestId('detection-modal')).toBeVisible();

    // Click "Add & Start Chat"
    await pageB.getByTestId('detection-add-contact-btn').click();

    // Verify User B is in Single Chat Page
    await expect(pageB.getByTestId('chat-view-container')).toBeVisible();
  });

  // =========================================================================
  // 10. User B Back to List (Step 12)
  // =========================================================================
  await test.step('Setup: User B Back to List', async () => {
    await pageB.getByTestId('back-to-list-btn').click();
    await expect(pageB.getByTestId('chat-view-container')).toBeHidden();

    // Verify connection exists visually
    await expect(pageB.getByTestId(`chat-item-${userAName}`)).toBeVisible();
  });

  return {
    userA: {
      context: contextA,
      page: pageA,
      authPage: authPageA,
      contactPage: contactPageA,
      name: userAName,
      pin: userAPin,
      stealthId: userAStealthId,
    },
    userB: {
      context: contextB,
      page: pageB,
      authPage: authPageB,
      contactPage: contactPageB,
      name: userBName,
      pin: userBPin,
      stealthId: userBStealthId,
    },
  };
}
