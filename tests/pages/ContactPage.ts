import { Page, expect } from '@playwright/test';

export class ContactPage {
  constructor(readonly page: Page) {}

  async navigateToContacts() {
    await this.page.getByTestId('nav-keys-tab').click();
  }

  async copyIdentity(): Promise<string> {
      // Ensure we are on the dashboard/chats where the copy button is (usually)
      // Or just click it if visible. Best to ensure tab.
      // But button might be globally available? No, usually in header.
      // Let's assume user is on Dashboard (Test logic puts them there).
      const copyBtn = this.page.getByTestId('copy-identity-home');
      await expect(copyBtn).toBeVisible();
      await copyBtn.click({ force: true });
      // Read clipboard
      return await this.page.evaluate(() => navigator.clipboard.readText());
  }

  async openAddContactManual() {
    // Navigate to keys
    await this.navigateToContacts();
    // Open Manual Import (Assuming "Add Contact" or similar button triggers modal)
    // The UI shows 3 buttons in AddContact component.
    // We need to trigger the Manual one.
    // But first, we need to click the main FAB "Add Contact" usually?
    // In ChatList, we confirmed `data-testid="add-chat-button"`.
    // In KeyExchange/AddContact, we see:
    // <span ...>{t('add_contact.buttons.manual')}</span> which is inside a button.
    // Let's rely on finding text "Manual Entry" or similar from translation keys.
    // 'add_contact.buttons.manual' -> "Manual Entry" usually.
    // We will target via text for now as we don't have ID on the button itself yet.
    // Wait! AddContact.tsx logic shows it renders these buttons directly?
    // If we are on the Keys page, these buttons are visible.

    await this.page.getByTestId('manual-entry-button').click();
  }

  async fillManualContact(identityString: string): Promise<void> {
    const manualInput = this.page.getByTestId('manual-import-textarea');
    await expect(manualInput).toBeVisible();
    await manualInput.fill(identityString);

    // Click Import & Decode
    const decodeBtn = this.page.getByTestId('manual-import-decode-btn');
    await decodeBtn.click();

    // Verify modal closes (Success)
    // await expect(manualInput).toBeHidden();
  }

  async submitContact() {
    // Click "Add Contact" in footer
    const addBtn = this.page.getByTestId('detection-add-contact-btn');
    await addBtn.click();
  }

  async verifyContactAdded(name: string) {
      // Check in list using strict test ID
      await expect(this.page.getByTestId(`chat-item-${name}`).first()).toBeVisible();
  }
}
