import { expect, test } from '@playwright/test';
import { AuthPage } from '../pages/AuthPage';
import { ChatListPage } from '../pages/ChatListPage';


test.describe('Chat List Actions (Contact Management)', () => {
  test.setTimeout(120000); // 2 minutes timeout for slow environments

  let authPage: AuthPage;
  let chatListPage: ChatListPage;

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);
    chatListPage = new ChatListPage(page);

    await page.goto('/');

    // Reset DB to ensure clean state
    await page.evaluate(async () => {
      // 1. Close active connection if exposed
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((window as any).nahanStorage) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (window as any).nahanStorage.close();
      }

      // 2. Delete databases
      const dbs = await window.indexedDB.databases();
      for (const db of dbs) {
        if (db.name) {
          await new Promise<void>((resolve, reject) => {
            const req = window.indexedDB.deleteDatabase(db.name!);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(new Error(`Failed to delete DB ${db.name}`));
            req.onblocked = () => {
              // console.warn(`DB ${db.name} deletion blocked. Waiting for connections to close...`);
            };
          });
        }
      }
    });

    await page.reload();

    // Signup with standard test credentials
    await authPage.performSignup('Tester', '123456');

    // Handle potential clipboard permission dialog
    const clipboardDismiss = page.getByTestId('clipboard-permission-dismiss');
    if (await clipboardDismiss.isVisible({ timeout: 3000 })) {
      await clipboardDismiss.click();
    }

    await expect(chatListPage.chatListTitle).toBeVisible({ timeout: 15000 });
  });

  // -------------------------------------------------------------------------
  // 1. Single Contact Operations
  // -------------------------------------------------------------------------

  test('should delete chat history for a specific contact', async ({ page }) => {
    const contactName = 'History User';
    const messageContent = 'Secret Message to Delete';

    // 1. Setup: Create contact and message
    await chatListPage.createMockContact(contactName);
    await chatListPage.createMockMessage(contactName, messageContent);

    // Verify message preview shows in list
    await expect(page.getByText(messageContent)).toBeVisible();

    // 2. Open Context Menu -> Delete History
    await chatListPage.openContextMenu(contactName);
    await page.getByTestId('contact-option-delete-history').click();

    // Wait for modal to be visible
    await page.waitForTimeout(1000);

    // Confirm
    const confirmButton = page.getByTestId('confirm-delete-history');
    await expect(confirmButton).toBeVisible({ timeout: 10000 });
    await confirmButton.click();

    // Wait for deletion to complete
    await page.waitForTimeout(2000);

    // 3. Verify
    // Message should be gone, replaced by "No messages yet"
    await expect(page.getByText(messageContent)).not.toBeVisible({ timeout: 10000 });

    // Verify specific contact item shows "No messages yet"
    const contactItem = await chatListPage.getContactItem(contactName);
    await expect(contactItem.getByText('No messages yet')).toBeVisible({ timeout: 10000 });

    // Contact should still exist
    await expect(contactItem).toBeVisible();
  });

  test('should delete a specific contact from the list', async ({ page }) => {
    const contactName = 'Delete User';

    // 1. Setup
    await chatListPage.createMockContact(contactName);

    // 2. Open Context Menu -> Delete Contact
    await chatListPage.openContextMenu(contactName);
    await page.getByTestId('contact-option-delete-contact').click();

    // Confirm
    await page.getByTestId('confirm-delete-contact').click();

    // 3. Verify
    await expect(page.getByText(contactName)).not.toBeVisible();
  });

  test('should rename a specific contact', async ({ page }) => {
    const oldName = 'Rename User';
    const newName = 'Renamed Successfully';

    // 1. Setup
    await chatListPage.createMockContact(oldName);

    // 2. Open Context Menu -> Rename
    await chatListPage.openContextMenu(oldName);
    await page.getByTestId('contact-option-rename').click();

    // Wait for modal
    await page.waitForTimeout(1000);

    // 3. Fill Rename Modal
    await expect(page.getByTestId('rename-modal-header')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('rename-input').fill(newName);
    await page.getByTestId('rename-save-button').click();

    // Wait for rename to complete
    await page.waitForTimeout(2000);

    // 4. Verify
    await expect(await chatListPage.getContactItem(newName)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(oldName)).not.toBeVisible({ timeout: 10000 });
  });

  test('should share a specific contact', async ({ page }) => {
    const contactName = 'Share User';

    // 1. Setup
    await chatListPage.createMockContact(contactName);

    // 2. Open Context Menu -> Share
    await chatListPage.openContextMenu(contactName);
    await page.getByTestId('contact-option-share').click();

    // 3. Verify QR Code Modal
    // The modal usually has a header or QR code element
    await expect(page.getByText('Contact Identity')).toBeVisible(); // Adjust text if needed
    // Or check for QR canvas/svg
    await expect(page.locator('canvas, svg').first()).toBeVisible();

    // Close modal
    await page.getByTestId('qr-modal-close-button').click();
  });

  // -------------------------------------------------------------------------
  // 2. Multiple Contact Operations
  // -------------------------------------------------------------------------

  test('should delete chat histories for multiple contacts', async ({ page }) => {
    const userA = 'User A';
    const userB = 'User B';

    // 1. Setup
    await chatListPage.createMockContact(userA);
    await chatListPage.createMockMessage(userA, 'Msg A');

    await chatListPage.createMockContact(userB);
    await chatListPage.createMockMessage(userB, 'Msg B');

    // 2. Enter Selection Mode on User A
    await chatListPage.enterSelectionMode(userA);

    // 3. Select User B
    await chatListPage.selectContactInMode(userB);
    await expect(page.getByText('2 selected')).toBeVisible();

    // 4. Bulk Menu -> Delete History
    await chatListPage.selectionMenuTrigger.click();
    await page.getByTestId('contact-option-bulk-delete-history').click();

    // Wait for modal
    await page.waitForTimeout(1000);

    // Confirm
    const confirmButton = page.getByTestId('confirm-delete-history');
    await expect(confirmButton).toBeVisible({ timeout: 10000 });
    await confirmButton.click();

    // Wait for deletion to complete
    await page.waitForTimeout(2000);

    // 5. Verify
    // Wait for UI to settle (selection mode might exit or list refreshes)
    await expect(page.getByText('Msg A')).not.toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Msg B')).not.toBeVisible({ timeout: 10000 });

    // Both contacts should still be there
    await expect(page.getByText(userA)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(userB)).toBeVisible({ timeout: 10000 });
  });

  test('should delete multiple contacts from the list', async ({ page }) => {
    const userC = 'User C';
    const userD = 'User D';
    const userKeep = 'User Keep';

    // 1. Setup
    await chatListPage.createMockContact(userC);
    await chatListPage.createMockContact(userD);
    await chatListPage.createMockContact(userKeep);

    // 2. Enter Selection Mode
    await chatListPage.enterSelectionMode(userC);
    await chatListPage.selectContactInMode(userD);

    // 3. Bulk Menu -> Delete Contact
    await chatListPage.selectionMenuTrigger.click();
    await page.getByTestId('contact-option-bulk-delete-contact').click();

    // Confirm
    await page.getByTestId('confirm-delete-contact').click();

    // 4. Verify
    await expect(page.getByText(userC)).not.toBeVisible();
    await expect(page.getByText(userD)).not.toBeVisible();
    await expect(page.getByText(userKeep)).toBeVisible();
  });
});
