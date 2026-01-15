import { expect, test } from '@playwright/test';
/* eslint-disable max-lines-per-function */
import { AuthPage } from '../pages/AuthPage';

test.describe.serial('ChatList Realtime Updates & Sorting', () => {

    test('should sort chats correctly by newest message (Broadcast vs User1 vs User2)', async ({ browser }) => {
        test.setTimeout(90000); // 90s timeout

        // Helper to get Identity
        const getIdentity = async (page) => {
             // Grant permissions for this context
            await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

            const authPage = new AuthPage(page);
            await authPage.goto();

            // Randomize name to avoid any potential collision even in fresh contexts (good practice)
            const name = `User${Date.now()}`;
            await authPage.performSignup(name, '123456');

            // Copy ID
            await expect(page.getByTestId('copy-identity-home')).toBeVisible();

            // Intercept writeText
            const identity = await page.evaluate(async () => {
                return new Promise<string>((resolve, reject) => {
                    const original = navigator.clipboard.writeText;
                    // @ts-expect-error - Mocking
                    navigator.clipboard.writeText = async (t) => {
                        resolve(t);
                        navigator.clipboard.writeText = original;
                    };
                    const btn = document.querySelector('[data-testid="copy-identity-home"]');
                    if (btn) (btn as HTMLElement).click();
                    else reject('Copy button not found');
                });
            });
            return { identity, name };
        };

        // =========================================================================
        // 1. Generate Identity for User 1
        // =========================================================================
        const context1 = await browser.newContext();
        const page1 = await context1.newPage();
        const user1 = await test.step('Setup: Generate User 1 Identity', async () => {
             return await getIdentity(page1);
        });
        await context1.close();

        // =========================================================================
        // 2. Generate Identity for User 2
        // =========================================================================
        const context2 = await browser.newContext();
        const page2 = await context2.newPage();
        const user2 = await test.step('Setup: Generate User 2 Identity', async () => {
             return await getIdentity(page2);
        });
        await context2.close();

        // =========================================================================
        // 3. Main Test: Signup as Tester
        // =========================================================================
        const contextTester = await browser.newContext();
        const page = await contextTester.newPage();
        await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
        const authPage = new AuthPage(page);

        await test.step('Main: Signup Tester', async () => {
            await authPage.goto();
            await authPage.performSignup('Tester', '111111');
        });

        // =========================================================================
        // 4. Add User 1 and User 2
        // =========================================================================
        const addUser = async (identityString: string, expectedName: string) => {
            await page.getByTestId('chat-list-manual-paste-icon').click();
            const input = page.getByTestId('manual-import-textarea');
            await expect(input).toBeVisible();
            await input.fill(identityString);
            await page.getByTestId('manual-import-decode-btn').click();

            const detectionModal = page.getByTestId('detection-modal');
            await expect(detectionModal).toBeVisible();
            await page.getByTestId('detection-add-contact-btn').click();

            // Note: The app might use the name embedded in the ID, which is random "UserMs..."
            // We should verify partial match or just store the returned name
            await expect(page.getByTestId('chat-header-name')).toContainText(expectedName);
            await page.getByTestId('back-to-list-btn').click();
        };

        await test.step('Action: Add User 1', async () => {
             await addUser(user1.identity, user1.name);
        });

        await test.step('Action: Add User 2', async () => {
             await addUser(user2.identity, user2.name);
        });

        // =========================================================================
        // 5. Verify Initial Order
        // =========================================================================
        await expect(page.getByTestId('chat-list-item-BROADCAST')).toBeVisible();
        await expect(page.getByTestId(`chat-item-${user1.name}`)).toBeVisible();
        await expect(page.getByTestId(`chat-item-${user2.name}`)).toBeVisible();

        // =========================================================================
        // 6. Send to User 1
        // =========================================================================
        const msg1 = `Hello User 1 - ${Date.now()}`;
        await test.step('Action: Send to User 1', async () => {
            await page.getByTestId(`chat-item-${user1.name}`).click();
            await page.getByTestId('chat-input').fill(msg1);
            await page.getByTestId('chat-send-btn').click();
            await expect(page.locator(`text=${msg1}`).first()).toBeVisible();

            // Wait 500ms for optimistic update to surely settle in state
            await page.waitForTimeout(500);

            await page.getByTestId('back-to-list-btn').click();
        });

        await test.step('Verify: User 1 Sorted to Top', async () => {
             const items = page.locator('[data-testid^="chat-list-item-"], [data-testid^="chat-item-"]');
             // 0: Broadcast
             // 1: User 1
             await expect(items.nth(0)).toHaveAttribute('data-testid', 'chat-list-item-BROADCAST');
             await expect(items.nth(1)).toHaveAttribute('data-testid', `chat-item-${user1.name}`);
             await expect(items.nth(1)).toContainText(msg1);
        });

        // =========================================================================
        // 7. Send to User 2
        // =========================================================================
        const msg2 = `Hello User 2 - ${Date.now()}`;
        await test.step('Action: Send to User 2', async () => {
            await page.getByTestId(`chat-item-${user2.name}`).click();
            await page.getByTestId('chat-input').fill(msg2);
            await page.getByTestId('chat-send-btn').click();
            await expect(page.locator(`text=${msg2}`).first()).toBeVisible();
            await page.waitForTimeout(500);
            await page.getByTestId('back-to-list-btn').click();
        });

        await test.step('Verify: User 2 Sorted to Top', async () => {
             const items = page.locator('[data-testid^="chat-list-item-"], [data-testid^="chat-item-"]');
             await expect(items.nth(0)).toHaveAttribute('data-testid', 'chat-list-item-BROADCAST');
             await expect(items.nth(1)).toHaveAttribute('data-testid', `chat-item-${user2.name}`);
             await expect(items.nth(1)).toContainText(msg2);
             await expect(items.nth(2)).toHaveAttribute('data-testid', `chat-item-${user1.name}`);
        });

         await contextTester.close();
    });
});
