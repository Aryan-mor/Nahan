
import { expect, test } from '@playwright/test';
import { P2PUser, setupConnectedUsers } from '../utils/p2p-setup';

test.describe.serial('Broadcast Messaging (Multi-User)', () => {
    let userA: P2PUser;
    let userB: P2PUser;

    test.beforeAll(async ({ browser }) => {
        // Shared P2P setup (Users A and B connected)
        // User A will be the Sender (Broadcast)
        // User B will be the Receiver
        const result = await setupConnectedUsers(browser);
        userA = result.userA;
        userB = result.userB;
    });

    test.afterAll(async () => {
        if (userA?.context) await userA.context.close();
        if (userB?.context) await userB.context.close();
    });

    test('Broadcast Messaging Flow', async () => {
        test.setTimeout(180000);

        const pageA = userA.page;
        const pageB = userB.page;
        const broadcastMsg = "Hello Everyone - Broadcast Test";

        // =========================================================================
        // 1. User A: Send Broadcast Message
        // =========================================================================
        await test.step('User A: Send Broadcast', async () => {
             // Navigate to Chat List if not already there
             if (!await pageA.getByTestId('chat-list-container').isVisible()) {
                 await pageA.getByTestId('nav-chats').click();
             }

             // Click "Broadcast Channel"
             // Using regex for robustness against exact naming, but expecting "Broadcast"
             await pageA.getByTestId('chat-list-item-BROADCAST').click();

             await expect(pageA.getByTestId('chat-view-container')).toBeVisible();

             // Verify Manual Paste Button is Hidden in Broadcast Channel
             await expect(pageA.getByTestId('chat-input-manual-paste-btn')).toBeHidden();

             // Send Message
             await pageA.getByTestId('chat-input-field').fill(broadcastMsg);
             await pageA.getByTestId('chat-send-btn').click();

             // Verify Bubble
             await expect(pageA.getByTestId('message-content').last()).toHaveText(broadcastMsg, { timeout: 15000 });
        });

        // =========================================================================
        // 2. User A: Capture Output (Auto-Copy / Clipboard)
        // =========================================================================
        let encryptedBroadcastMsg = '';
        await test.step('User A: Capture Encrypted Broadcast', async () => {
             // Since we granted clipboard permissions, we can read what was auto-copied.
             await expect.poll(async () => {
                 const text = await pageA.evaluate(() => navigator.clipboard.readText());
                 return text;
             }).toMatch(/[\u0600-\u06FF]/); // Persian text (Stealth)

             encryptedBroadcastMsg = await pageA.evaluate(() => navigator.clipboard.readText());
             expect(encryptedBroadcastMsg).toBeTruthy();
        });

        // =========================================================================
        // 3. User B: Manual Import
        // =========================================================================
        await test.step('User B: Manual Import', async () => {
             // Go to Chat List
             if (await pageB.getByTestId('chat-view-container').isVisible()) {
                 await pageB.getByTestId('back-to-list-btn').click();
             }

             // Open Manual Paste Modal
             await pageB.getByTestId('chat-list-manual-paste-icon').click();
             const input = pageB.getByTestId('manual-import-textarea');
             await expect(input).toBeVisible();

             // Paste Message
             await input.fill(encryptedBroadcastMsg);

             // Decode
             const decodeBtn = pageB.getByTestId('manual-import-decode-btn');
             await expect(decodeBtn).toBeEnabled();
             await decodeBtn.click();
        });

        // =========================================================================
        // 4. User B: Verify Receipt in User A's Chat
        // =========================================================================
        await test.step('User B: Verify Message in User A Chat', async () => {
             // Expect Detection Modal
             await expect(pageB.getByTestId('detection-modal')).toBeVisible();

             // Check title/content to ensure it's identified as from User A (or just check correct routing)
             // The modal title usually says "New Message from [Name]" or "Broadcast from [Name]"

             // Click "View Chat"
             await pageB.getByTestId('detection-view-chat-btn').click();

             // Verify Navigation to Chat View
             await expect(pageB.getByTestId('chat-view-container')).toBeVisible();

             // CRITICAL: Verify we are in User A's chat.
             // We can check the header name.
             await expect(pageB.getByTestId('chat-header-name')).toHaveText(userA.name);


             await pageB.waitForTimeout(2000);
             // Verify Message Content
             await expect(pageB.getByTestId('message-content').last()).toHaveText(broadcastMsg);
        });
    });
});
