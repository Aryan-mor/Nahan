import { Page, expect } from '@playwright/test';

export class ContactPage {
  constructor(readonly page: Page) {}

  async navigateToContacts() {
    await this.page.getByTestId('nav-keys-tab').click();
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

    await this.page.getByTestId('add-contact-manual-btn').click();
  }

  async fillManualContact(identityString: string): Promise<void> {
    const manualInput = this.page.getByTestId('manual-import-textarea');
    await expect(manualInput).toBeVisible();
    await manualInput.fill(identityString);

    // Click Import & Decode
    const decodeBtn = this.page.getByTestId('manual-import-decode-btn');
    await decodeBtn.click();

    // Verify modal closes (Success)
    // The previous implementation returned boolean to indicate subsequent action,
    // but now the flow transitions directly to DetectionModal.
    await expect(manualInput).toBeHidden();
  }

  async submitContact() {
    // Click "Add Contact" in footer
    // We don't have ID on footer button, so verify text.
    const addBtn = this.page.getByRole('button', { name: /add contact/i }).last();
    await addBtn.click();
  }

  async verifyContactAdded(name: string) {
      // Check in list using strict test ID
      await expect(this.page.getByTestId(`chat-item-${name}`).first()).toBeVisible();
  }
}
