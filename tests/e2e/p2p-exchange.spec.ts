

import { expect, test } from '@playwright/test';
import { P2PUser, setupConnectedUsers } from '../utils/p2p-setup';

test.describe.serial('P2P Messaging (Multi-User)', () => {
    let userA: P2PUser;
    let userB: P2PUser;

    test.beforeAll(async ({ browser }) => {
        const result = await setupConnectedUsers(browser);
        userA = result.userA;
        userB = result.userB;
    });

    test.afterAll(async () => {
        if (userA?.context) await userA.context.close();
        if (userB?.context) await userB.context.close();
    });

    test('Secure P2P Messaging', async () => {
        test.setTimeout(180000);

        const pageA = userA.page;
        const pageB = userB.page;

        const msgAtoB = "Test message to UserB from UserA";
        const msgBtoA = "Test message to UserA from UserB";

        // 1. UserA go to chat of UserB
        await test.step('User A: Open Chat with User B', async () => {
             await expect(pageA.getByText(userB.name)).toBeVisible({ timeout: 10000 });
             await pageA.getByText(userB.name).click();
             await expect(pageA.getByTestId('chat-view-container')).toBeVisible();
        });

        // 2 & 3. UserA sends message and verify clipboard/bubble
        let encryptedMsgAtoB = '';
        await test.step('User A: Send Message', async () => {
            await pageA.getByTestId('chat-input').fill(msgAtoB);
            await pageA.getByTestId('chat-send-btn').click();

            // Verify Bubble
            await expect(pageA.getByTestId('message-content').last()).toHaveText(msgAtoB, { timeout: 15000 });

            // Verify Clipboard (Auto-Copy encrypted)
            await expect.poll(async () => {
                const text = await pageA.evaluate(() => navigator.clipboard.readText());
                // console.log('Clipboard content:', text);
                return text;
            }).toMatch(/[\u0600-\u06FF]/); // Expect Persian text (Stealth/Camouflage)

            encryptedMsgAtoB = await pageA.evaluate(() => navigator.clipboard.readText());
        });

        // 4. UserB (Manual) decrypts
        await test.step('User B: Manual Paste & Decrypt', async () => {
             // Go to Home if not already (Should be there from Setup)
             if (await pageB.getByTestId('chat-view-container').isVisible()) {
                 await pageB.getByTestId('back-to-list-btn').click();
             }

             await pageB.getByTestId('chat-list-manual-paste-icon').click();

             const input = pageB.getByTestId('manual-import-textarea');
             await expect(input).toBeVisible();
             await input.fill(encryptedMsgAtoB);

             const decodeBtn = pageB.getByTestId('manual-import-decode-btn');
             await expect(decodeBtn).toBeEnabled();
             await decodeBtn.click();
        });

        // 5 & 6. UserB New Message Modal -> View Chat -> Verify Bubble
        await test.step('User B: View Detected Message', async () => {
             // Verify Detection Modal appears
             await expect(pageB.getByTestId('detection-modal')).toBeVisible();

             // Click "View Chat"
             await pageB.getByTestId('detection-view-chat-btn').click();

             // Verify Navigation and Message
             await expect(pageB.getByTestId('chat-view-container')).toBeVisible();
             await expect(pageB.getByTestId('message-content').last()).toHaveText(msgAtoB, { timeout: 15000 });
        });

        // 7 & 8. UserB sends response -> Copy Block
        let encryptedMsgBtoA = '';
        await test.step('User B: Send Response & Copy', async () => {
             await pageB.getByTestId('chat-input').fill(msgBtoA);
             await pageB.getByTestId('chat-send-btn').click();



             // Verify Bubble
             await expect(pageB.getByTestId('message-content').first()).toHaveText(msgBtoA, { timeout: 15000 });

             // Intercept writeText since Read is denied
             encryptedMsgBtoA = await pageB.evaluate(async () => {
                 return new Promise<string>((resolve) => {
                     const original = navigator.clipboard.writeText;
                     // @ts-expect-error - Mocking
                     navigator.clipboard.writeText = async (t) => {
                         resolve(t);
                         navigator.clipboard.writeText = original; // Restore
                     };

                     // Robust Selector: Find ANY bubble with the copy button
                     const bubbles = Array.from(document.querySelectorAll('[data-testid="message-bubble"]'));

                     // In flex-col-reverse, the first bubble in DOM is the newest message
                     const targetBubble = bubbles[0];
                     if (!targetBubble) { throw new Error('No bubbles found'); }

                     const btn = targetBubble.querySelector('[data-testid="copy-block-btn"]');

                     if (!btn) {
                         // Fallback: search all
                         const fallbackBtn = document.querySelector('[data-testid="copy-block-btn"]');
                         if (fallbackBtn) {
                             (fallbackBtn as HTMLElement).click();
                             return;
                         }
                         throw new Error('Copy btn not found within bubble');
                     }
                     (btn as HTMLElement).click();
                 });
             });

             expect(encryptedMsgBtoA).toBeTruthy();
        });

        // 9 & 10. UserA Auto-Detect -> View Chat -> Verify Bubble
        await test.step('User A: Auto-Detect Response', async () => {
             // Stabilize: Wait for IndexedDB persistence of outgoing message
             await pageA.waitForTimeout(1000);

             // Assert Initial State: Should have 1 message (User A's sent message)
             await expect(pageA.getByTestId('message-bubble')).toHaveCount(1);

             // Ensure A triggers detection
             await pageA.evaluate(async (text) => {
                 await navigator.clipboard.writeText(text);
                 window.dispatchEvent(new Event('focus'));
                 // Force visibility change just in case
                 Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
                 document.dispatchEvent(new Event('visibilitychange'));
             }, encryptedMsgBtoA);

             // Check Modal
             await expect(pageA.getByTestId('detection-modal')).toBeVisible();
             await pageA.getByTestId('detection-view-chat-btn').click();

             // Verify Message
             // Verify Message History (Should have both sent and received)
             // Use message-bubble selector to count total messages
             await expect(pageA.getByTestId('message-bubble')).toHaveCount(2, { timeout: 10000 });

             // Verify content of both messages
             await expect(pageA.getByText(msgAtoB)).toBeVisible();
             await expect(pageA.getByTestId('chat-view-container').getByText(msgBtoA)).toBeVisible();
        });
    });
});
