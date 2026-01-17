
import { expect, test } from '@playwright/test';
import { P2PUser, setupConnectedUsers } from '../utils/p2p-setup';

test.describe.serial('Stealth Custom Cover (Multi-User)', () => {
    let userA: P2PUser;
    let userB: P2PUser;

    test.beforeAll(async ({ browser }) => {
        // Shared P2P setup (Users A and B connected)
        const result = await setupConnectedUsers(browser);
        userA = result.userA;
        userB = result.userB;
    });

    test.afterAll(async () => {
        if (userA?.context) await userA.context.close();
        if (userB?.context) await userB.context.close();
    });

    test('Send with Custom Cover Text', async () => {
        test.setTimeout(180000);

        const pageA = userA.page;
        const pageB = userB.page;
        const secretMsg = "My Secret Message";
        const coverMsg = `This is a boring weather report ${Date.now()}`;

        // =========================================================================
        // 1. User A: Prepare Message
        // =========================================================================
        await test.step('User A: Type Secret Message', async () => {
             // Navigate to User B's chat
             await pageA.getByText(userB.name).click();
             await expect(pageA.getByTestId('chat-view-container')).toBeVisible();

             await pageA.getByTestId('chat-input').fill(secretMsg);
        });

        // =========================================================================
        // 2. User A: Long Press to Open Stealth Modal
        // =========================================================================
        await test.step('User A: Long Press Send', async () => {
             const sendBtn = pageA.getByTestId('chat-send-btn');
             await expect(sendBtn).toBeVisible();

             // Retry loop for Long Press validation (Robustness for CI/Parallel)
             for (let i = 0; i < 3; i++) {
                 const box = await sendBtn.boundingBox();
                 if (box) {
                     await pageA.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
                     await pageA.mouse.down();
                     await pageA.waitForTimeout(1500); // Exceeds 500ms threshold
                     await pageA.mouse.up();
                 } else {
                     throw new Error('Send button bounding box not found');
                 }

                 try {
                     // Short timeout check for retry
                     await expect(pageA.getByTestId('stealth-cover-text-input')).toBeVisible({ timeout: 3000 });
                     return; // Success, modal appeared
                 } catch (_) {
                     // console.log(`Long press attempt ${i + 1} failed, retrying...`);
                     await pageA.waitForTimeout(500);
                 }
             }

             // Final expectation with standard timeout
             await expect(pageA.getByTestId('stealth-cover-text-input')).toBeVisible({ timeout: 10000 });
        });

        // =========================================================================
        // 3. User A: Customize Cover Text
        // =========================================================================
        await test.step('User A: Enter Custom Cover', async () => {
             const input = pageA.getByTestId('stealth-cover-text-input');
             await input.fill(coverMsg);

             // Wait for embedding/processing
             await expect(pageA.getByTestId('stealth-send-btn')).toBeEnabled();
        });

        // =========================================================================
        // 4. User A: Send & Capture Clipboard
        // =========================================================================
        let clipboardContent = '';
        await test.step('User A: Send & Capture', async () => {
             // Grant permissions to read clipboard
             await pageA.context().grantPermissions(['clipboard-read', 'clipboard-write']);

             await pageA.getByTestId('stealth-send-btn').click();
             // Modal should close
             await expect(pageA.getByTestId('stealth-cover-text-input')).not.toBeVisible();

             // Verify bubble in A's view (Sender sees Plain Text)
             const lastMessageText = await pageA.getByTestId('message-content').last().innerText();
             expect(lastMessageText).toBe(secretMsg);

             // Capture Clipboard for Transport (Auto-copied by app)
             clipboardContent = await pageA.evaluate(() => navigator.clipboard.readText());
             // We use this captured content for User B's import step
        });

        // =========================================================================
        // 5. User B: Manual Import (Simulate receiving via side-channel)
        // =========================================================================
        await test.step('User B: Decode via Manual Import', async () => {
             // Ensure User B is on the Chat List (Home) to access Import
             // Even if they are in a chat, go back to list
             if (await pageB.getByTestId('chat-view-container').isVisible()) {
                 await pageB.getByTestId('back-to-list-btn').click();
             }

             // Wait for Paste Icon in Header
             const pasteIcon = pageB.getByTestId('chat-list-manual-paste-icon');
             await expect(pasteIcon).toBeVisible();
             await pasteIcon.click();

             // Paste the captured content from User A
             await expect(pageB.getByTestId('manual-import-textarea')).toBeVisible();
             await pageB.getByTestId('manual-import-textarea').fill(clipboardContent);

             // Decode
             await pageB.getByTestId('manual-import-decode-btn').click();

             // Verify Detection Modal
             await expect(pageB.getByTestId('detection-modal')).toBeVisible();

             // Navigate to Chat
             await pageB.getByTestId('detection-view-chat-btn').click();

             await pageB.waitForTimeout(2000);

             // =========================================================================
             // 6. User B: Verify Decrypted Message
             // =========================================================================
             // IMPORTANT: Now we verify User B sees the SECRET message
             await expect(pageB.getByTestId('message-content').last()).toHaveText(secretMsg);
        });
    });
});
