
import { expect, test } from '@playwright/test';
import { P2PUser, setupConnectedUsers } from '../utils/p2p-setup';

test.describe.serial('Stealth Image Mask (Multi-User)', () => {
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

    test('Send with Generated Image Mask', async () => {
        test.setTimeout(180000);

        const pageA = userB.page;
        const pageB = userA.page;
        const secretMsg = "My Hidden Image Secret";

        // =========================================================================
        // 1. User A (Actually User B now): Prepare Message
        // =========================================================================
        await test.step('User A: Type Secret Message', async () => {
             await pageA.getByText(userA.name).click();
             await expect(pageA.getByTestId('chat-view-container')).toBeVisible();

             await pageA.getByTestId('chat-input-field').fill(secretMsg);
        });

        // =========================================================================
        // 2. User A: Long Press to Open Stealth Modal
        // =========================================================================
        await test.step('User A: Long Press Send', async () => {
             const sendBtn = pageA.getByTestId('chat-send-btn');
             await expect(sendBtn).toBeVisible();

             // Retry loop logic
             for (let i = 0; i < 3; i++) {
                 const box = await sendBtn.boundingBox();
                 if (box) {
                     await pageA.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
                     await pageA.mouse.down();
                     await pageA.waitForTimeout(1500);
                     await pageA.mouse.up();
                 }

                 try {
                     await expect(pageA.getByRole('dialog')).toBeVisible({ timeout: 3000 });
                     return;
                 } catch (_) {
                     await pageA.waitForTimeout(500);
                 }
             }
             await expect(pageA.getByRole('dialog')).toBeVisible({ timeout: 10000 });
        });

        // =========================================================================
        // 3. User A: Generate Image Mask
        // =========================================================================
        let capturedImageDataUrl = '';
        await test.step('User A: Generate & Send', async () => {
             // Switch to Image Tab (By Text: "Hide in Image")
             await pageA.getByText('Hide in Image').click();

             // Click Generate
             const generateBtn = pageA.getByTestId('stealth-generate-mask-btn');
             await expect(generateBtn).toBeVisible();
             await generateBtn.click();

             // Wait for Image to appear
             const img = pageA.getByTestId('stealth-generated-image');
             await expect(img).toBeVisible({ timeout: 15000 }); // Generation might take time

             // Capture the Data URL (Simulate Clipboard Copy)
             // The src is likely a blob: URL. We need to convert it to base64 DataURL.
             capturedImageDataUrl = await pageA.evaluate(async () => {
                 const img = document.querySelector('img[data-testid="stealth-generated-image"]') as HTMLImageElement;
                 if (!img) return '';
                 const src = img.src;
                 if (src.startsWith('data:')) return src;

                 try {
                     const response = await fetch(src);
                     const blob = await response.blob();
                     return new Promise<string>((resolve) => {
                         const reader = new FileReader();
                         reader.onloadend = () => resolve(reader.result as string);
                         reader.readAsDataURL(blob);
                     });
                 } catch (_) {
                     return '';
                 }
             });
             expect(capturedImageDataUrl).toBeTruthy();
             expect(capturedImageDataUrl).toContain('data:image');

             // Send
             await pageA.getByTestId('stealth-send-image-btn').click();

             // Verify Modal Closed
             await expect(pageA.getByRole('dialog')).not.toBeVisible();

             // Verify Bubble is Plain Text (Sender View)
             // As per user requirement: "In chat you should see the secretMsg not the image"
             // The image is hidden/cover only for the recipient initially (or just transport).
             await expect(pageA.getByTestId('message-content').last()).toHaveText(secretMsg);
        });

        // =========================================================================
        // 4. User B: Manual Import (Simulate Receiving Image File/Data)
        // =========================================================================
        await test.step('User B: Decode via Manual Import', async () => {
             // Go to Chat List (just in case)
             if (await pageB.getByTestId('chat-view-container').isVisible()) {
                 await pageB.getByTestId('back-to-list-btn').click();
                 await expect(pageB.getByTestId('chat-view-container')).not.toBeVisible();
             }

             // Open Manual Import
             const pasteIcon = pageB.getByTestId('chat-list-manual-paste-icon');
             await expect(pasteIcon).toBeVisible({ timeout: 10000 });
             await pageB.waitForTimeout(500); // Settle UI
             await pasteIcon.click({ force: true });

             // Check if Auto-Detection worked (Modal Visible) or if we need to Manually Paste
             try {
                // Check if detection modal appeared automatically (via clipboard)
                await expect(pageB.getByTestId('detection-modal')).toBeVisible({ timeout: 5000 });
             } catch (_) {
                // If not visible, perform manual paste
                const textareaSelector = '[data-testid="manual-import-textarea"]';
                await pageB.waitForSelector(textareaSelector, { state: 'visible', timeout: 5000 });

                // Use evaluate for large Base64 string to avoid typing delay/crash
                await pageB.evaluate(({ selector, value }) => {
                    const el = document.querySelector(selector) as HTMLTextAreaElement;
                    if (el) {
                        el.value = value;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }, { selector: textareaSelector, value: capturedImageDataUrl });

                // Decode
                await pageB.getByTestId('manual-import-decode-btn').click();

                // Verify Detection Modal
                // Decoding image might be slow (steganography read + crypto)
                await expect(pageB.getByTestId('detection-modal')).toBeVisible({ timeout: 30000 });
             }

             // View Chat
             await pageB.getByTestId('detection-view-chat-btn').click();


             await pageB.waitForTimeout(2000);
             // =========================================================================
             // 5. User B: Verify Decrypted Message
             // =========================================================================
             await expect(pageB.getByTestId('message-content').last()).toHaveText(secretMsg);
        });
    });
});
