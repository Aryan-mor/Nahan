import { Page, expect } from '@playwright/test';

export class ContactPage {
  constructor(readonly page: Page) {}

  async navigateToContacts() {
    // If Chat View is open, close it first
    if (await this.page.getByTestId('chat-view-container').isVisible()) {
      await this.page.getByTestId('back-to-list-btn').click();
      await expect(this.page.getByTestId('chat-view-container')).toBeHidden();
    }

    // If already on the page (check for a unique element), return
    if (await this.page.getByTestId('add-contact-scan-btn').isVisible()) {
      return;
    }

    const desktopTab = this.page.getByTestId('nav-keys-tab');
    const mobileTab = this.page.getByTestId('nav-mobile-keys-tab');

    if (await desktopTab.isVisible()) {
      await desktopTab.click();
    } else {
      // Assume mobile if desktop is not visible
      await mobileTab.click();
    }

    // Wait for the Keys view to load with a generous timeout and retry logic
    try {
      await expect(this.page.getByTestId('add-contact-scan-btn')).toBeVisible({ timeout: 10000 });
    } catch (_e) {
      const anyKeysBtn = this.page
        .getByRole('button', { name: 'Keys' })
        .filter({ hasText: 'Keys' })
        .first();
      if (await anyKeysBtn.isVisible()) {
        await anyKeysBtn.click({ force: true });
      } else {
        // Retry the explicit IDs
        if (await desktopTab.isVisible()) await desktopTab.click({ force: true });
        else await mobileTab.click({ force: true });
      }

      await expect(this.page.getByTestId('add-contact-scan-btn')).toBeVisible({ timeout: 10000 });
    }
  }

  async copyIdentity(): Promise<string> {
    const copyBtn = this.page.getByTestId('copy-identity-home');
    await expect(copyBtn).toBeVisible();
    await copyBtn.click({ force: true });
    return await this.page.evaluate(() => navigator.clipboard.readText());
  }

  async openAddContactManual() {
    await this.navigateToContacts();
    await this.page.getByTestId('manual-entry-button').click();
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
  }

  async verifyContactAdded(name: string) {
    await this.page.getByTestId('nav-chats-tab').click();
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
