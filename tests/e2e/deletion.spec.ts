/* eslint-disable max-lines-per-function */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test } from '@playwright/test';

test.describe('Message Deletion', () => {
  test('Hard Delete: Message is physically removed from IDB', async ({ page }) => {
    // 1. Setup: Load App
    await page.goto('/');

    // 2. Setup: Mock Identity/Login (if needed) or go through Onboarding
    // For now, assuming fresh state -> Onboarding
    // Fill Onboarding
    await page.getByPlaceholder('Enter display name').fill('TestUser');
    await page.getByText('Create Identity').click();
    await page.getByPlaceholder('Enter PIN to lock').fill('123456');
    await page.getByText('Set PIN').click();

    // Wait for main screen
    await expect(page.getByText('TestUser')).toBeVisible();

    // 3. Send a Message (Self-message for simplicity or Broadcast? Broadcast is easier as it echoes)
    // Let's send a broadcast to ensure it appears
    await page.getByPlaceholder('Type a message...').fill('DeleteMePayload');
    await page.getByRole('button', { name: 'Send' }).click();

    // 4. Verify Message Appears
    await expect(page.getByText('DeleteMePayload')).toBeVisible();

    // 5. Get Message ID from DOM (assuming data-id attribute or similar, usually we delete the last one)
    // Depending on UI, right click -> delete or long press
    // For now, assume a delete button exists or context menu
    // We might need to inspect the code to see how deletion is triggered in UI.
    // Let's assume right-click for now or just generic deletion flow.
    // If we don't know the UI, we'll try to trigger it via code injection or generic click.

    // Right click the message
    await page.getByText('DeleteMePayload').click({ button: 'right' });
    // Click Delete in context menu (if exists)
    await page.getByText('Delete').click();
    // Confirm (if modal)
    // await page.getByText('Confirm').click(); // Adjust based on actual UI

    // 6. Verify Gone from UI
    await expect(page.getByText('DeleteMePayload')).not.toBeVisible();

    // 7. Verify Gone from IndexedDB (Hard Delete Check)
    const isGone = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const req = indexedDB.open('nahan_secure_v1');
        req.onsuccess = (e: any) => {
          const db = e.target.result;
          const tx = db.transaction('secure_vault', 'readonly');
          const store = tx.objectStore('secure_vault');
          const keysReq = store.getAllKeys();
          keysReq.onsuccess = () => {
             // We encrypt everything, so we can't easily check content 'DeleteMePayload' in DB directly without decrypting.
             // But we can check count or checks if ANY message exists if it was the only one.
             // OR, better: The ID should have been removed.
             // Since we can't know the exact ID easily from outside without interception,
             // checking that the message count decreased is a good proxy.
             // Or we can check if there are 0 messages left (assuming fresh start).
             const keys = keysReq.result;
             const messageKeys = keys.filter((k: string) => k.startsWith('msg_'));
             resolve(messageKeys.length === 0);
          };
        };
      });
    });

    expect(isGone).toBe(true);
  });
});
