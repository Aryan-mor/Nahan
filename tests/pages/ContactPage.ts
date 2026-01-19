import { Page, expect } from '@playwright/test';

export class ContactPage {
  constructor(readonly page: Page) {}

  async navigateToContacts() {
    // Handle potential detection modal blocking navigation (e.g. from clipboard content)
    const modal = this.page.getByTestId('detection-modal');
    try {
      // Wait briefly for modal to appear (it triggers on page focus/load)
      await modal.waitFor({ state: 'visible', timeout: 8000 });

      // Dismiss it using the specifically scoped button
      const dismissBtn = modal.getByRole('button', { name: 'Dismiss' });
      await dismissBtn.click();
      // Wait for it to be fully removed from DOM to prevent blocking pointer events
      await modal.waitFor({ state: 'detached', timeout: 5000 });
    } catch {
      // Ignore if modal doesn't appear within timeout
    }

    // Navigate via proper Desktop Tab (Viewport enforced in test config)
    const tab = this.page.getByTestId('nav-keys-tab');
    await expect(tab).toBeVisible({ timeout: 15000 });
    await tab.click();

    // Wait for the Keys view to load
    await expect(this.page.getByTestId('add-contact-scan-btn')).toBeVisible({ timeout: 30000 });
  }

  async copyIdentity(force: boolean = false): Promise<string> {
    const copyBtn = this.page.getByTestId('copy-identity-home');
    await expect(copyBtn).toBeVisible();
    await this.page.waitForTimeout(500); // Wait for animations
    await copyBtn.click({ force });
    
    // Check if toast appears
    const successToast = this.page.getByText('Identity copied to clipboard');
    const errorToast = this.page.getByText('Failed to copy identity');
    
    try {
        await expect(successToast.or(errorToast)).toBeVisible({ timeout: 5000 });
    } catch (e) {
        // If toast didn't appear but we are in a test environment where clipboard might have worked anyway,
        // we double check the clipboard content.
        const clipboardContent = await this.page.evaluate(() => navigator.clipboard.readText());
        if (clipboardContent && clipboardContent.length > 0) {
            return clipboardContent;
        }
        throw e;
    }
    
    if (await errorToast.isVisible()) {
        throw new Error('Failed to copy identity to clipboard');
    }
    
    return await this.page.evaluate(() => navigator.clipboard.readText());
  }

  async openAddContactManual() {
    await this.navigateToContacts();
    await this.page.getByTestId('manual-entry-button').click({ force: true });
    // Wait for the manual import modal to be fully visible and stable
    await expect(this.page.getByTestId('manual-import-textarea')).toBeVisible({ timeout: 10000 });
  }

  async fillManualContact(identityString: string): Promise<void> {
    const manualInput = this.page.getByTestId('manual-import-textarea');
    await expect(manualInput).toBeVisible();
    await manualInput.fill(identityString);

    const decodeBtn = this.page.getByTestId('manual-import-decode-btn');
    await decodeBtn.click();
  }

  async submitContact() {
    const addBtn = this.page.getByTestId('detection-add-contact-btn');
    await addBtn.click();

    // Wait for the detection modal to close before continuing
    await this.page.getByTestId('detection-modal').waitFor({ state: 'detached', timeout: 10000 });
  }

  async verifyContactAdded(name: string) {
    // If Chat View is open (blocking navigation), close it first
    if (await this.page.getByTestId('chat-view-container').isVisible()) {
      await this.page.getByTestId('back-to-list-btn').click();
      await expect(this.page.getByTestId('chat-view-container')).toBeHidden();
    }

    // Try to click the chats tab (handling potential mobile/desktop visibility if needed,
    // but trusting the existing selector if it was just an overlay issue)
    const chatsTab = this.page.getByTestId('nav-chats-tab');
    const mobileChatsTab = this.page.getByTestId('nav-mobile-chats-tab');

    if (await chatsTab.isVisible()) {
      await chatsTab.click();
    } else if (await mobileChatsTab.isVisible()) {
      await mobileChatsTab.click();
    } else {
        // Fallback or force click one of them if neither seems visible (unlikely if chat view is closed)
        await chatsTab.click({ force: true });
    }

    await expect(this.page.getByTestId(`chat-item-${name}`).first()).toBeVisible();
  }

  async openAddContactScanner() {
    await this.navigateToContacts();
    await this.page.getByTestId('add-contact-scan-btn').click();
  }

  async uploadContactQR(filePath: string) {
    await this.navigateToContacts();
    await expect(this.page.getByTestId('add-contact-upload-btn')).toBeVisible();
    const fileInput = this.page.locator('input[type="file"][accept="image/*"]').first();
    await fileInput.setInputFiles(filePath);
  }

  async verifyScannerOpen() {
    await expect(this.page.getByTestId('contact-scan-video')).toBeVisible();
    await expect(this.page.getByText('Point camera at a NAHAN QR code')).toBeVisible();
  }

  async verifyContactModalOpen(expectedName?: string) {
    // Check for the detection modal container first
    const modal = this.page.getByTestId('detection-modal');
    await expect(modal).toBeVisible({ timeout: 15000 });

    // "New Contact Detected" or similar title
    await expect(modal.getByText('New Contact Detected', { exact: false })).toBeVisible();
    if (expectedName) {
      await expect(modal.getByText(expectedName)).toBeVisible();
    }
  }

  async confirmAddContact() {
    await this.page.getByTestId('detection-add-contact-btn').click();
  }
}
