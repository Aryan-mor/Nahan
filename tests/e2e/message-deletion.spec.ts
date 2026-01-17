 
import { expect, test } from '@playwright/test';
import { P2PUser, setupConnectedUsers } from '../utils/p2p-setup';

test.describe.serial('Message Deletion Protocol', () => {
  let user: P2PUser;

  test.beforeAll(async ({ browser }) => {
    // Reuse setupConnectedUsers to get a ready-to-use user (User A)
    // We ignore User B for this specific test
    const result = await setupConnectedUsers(browser);
    user = result.userA;
  });

  test.afterAll(async () => {
    if (user && user.context) await user.context.close();
  });

  test('Should strictly delete message from IndexedDB and memory', async () => {
    const page = user.page;

    // 1. Setup: User is already logged in (from setupConnectedUsers)
    // user.page is initially at Chat List.
    // Click Broadcast channel (always exists)
    await page.getByTestId('chat-list-item-BROADCAST').click();
    await expect(page.getByTestId('chat-view-container')).toBeVisible();

    // 2. Send a unique message
    const secretContent = `DeleteMe_${Date.now()}`;
    await page.getByTestId('chat-input').fill(secretContent);
    await page.getByTestId('chat-send-btn').click();

    // 3. Verify message exists in UI
    const bubble = page.getByTestId('message-bubble').filter({ hasText: secretContent }).first();
    await expect(bubble).toBeVisible();

    // Wait for persistence (debounce/async storage)
    await page.waitForTimeout(500);

    // 4. Verify message exists in IndexedDB (secure_vault)
    const dbCountBefore = await page.evaluate(async () => {
      return new Promise<number>((resolve, reject) => {
        const req = indexedDB.open('nahan');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('secure_vault', 'readonly');
          const store = tx.objectStore('secure_vault');
          const getAll = store.getAll();
          getAll.onsuccess = () => {
            // Counts messages only (id starts with 'idx_')
            // Note: logic in storage.ts uses 'idx_' prefix (V2.2).
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const messages = getAll.result.filter((r: any) => r.id && r.id.startsWith('idx_'));
            resolve(messages.length);
          };
        };
        req.onerror = () => reject(req.error);
      });
    });

    expect(dbCountBefore).toBeGreaterThan(0);

    // 5. Delete the message via UI
    await bubble.hover();
    await bubble.getByTestId('message-options-btn').click();

    // Handle Confirm Dialog
    page.on('dialog', (dialog) => dialog.accept());

    await page.getByTestId('delete-message-on-dropdown').click();

    // 6. Verify UI disappearance
    await expect(bubble).toBeHidden();

    // 7. Verify IndexedDB Deletion (The "Real Delete" Check)
    const dbCountAfter = await page.evaluate(async () => {
      return new Promise<number>((resolve, reject) => {
        const req = indexedDB.open('nahan');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('secure_vault', 'readonly');
          const store = tx.objectStore('secure_vault');
          const getAll = store.getAll();
          getAll.onsuccess = () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const messages = getAll.result.filter((r: any) => r.id && r.id.startsWith('idx_'));
            resolve(messages.length);
          };
        };
        req.onerror = () => reject(req.error);
      });
    });

    // Verification: The message count should decrease by exactly 1
    expect(dbCountAfter).toBe(dbCountBefore - 1);
  });
});
