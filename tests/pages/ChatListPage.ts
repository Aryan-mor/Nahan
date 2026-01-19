import { expect, Locator, Page } from '@playwright/test';

export class ChatListPage {
  readonly page: Page;
  readonly chatListTitle: Locator;
  readonly newChatButton: Locator;
  readonly selectionMenuTrigger: Locator;
  readonly selectButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.chatListTitle = page.getByTestId('chat-list-title');
    this.newChatButton = page.getByTestId('add-chat-button');
    this.selectionMenuTrigger = page.getByTestId('selection-menu-trigger');
    this.selectButton = page.getByTestId('contact-option-select');
  }

  async goto() {
    await this.page.goto('/');
  }

  async ensureMasterKey() {
    await this.page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const storage = (window as any).nahanStorage;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const secure = (window as any).nahanSecureStorage;

      if (!storage || !secure) throw new Error('Services not exposed');

      if (!secure.getMasterKey()) {
        // console.log('Test Helper: Master Key not loaded. Attempting to restore...');
        const wrappedKey = await storage.getSystemSetting('wrapped_master_key');
        const deviceSeed = await storage.getSystemSetting('device_seed');

        if (wrappedKey && deviceSeed) {
          const hardwareSecret = new TextEncoder().encode(deviceSeed);
          // Assuming standard test PIN '123456'
          const masterKey = await secure.unwrapMasterKey(wrappedKey, '123456', hardwareSecret);
          secure.setMasterKey(masterKey);
          // console.log('Test Helper: Master Key restored successfully.');
        } else {
          throw new Error('Test Helper: Cannot restore Master Key - missing storage artifacts');
        }
      }
    });
  }

  private async reloadAndUnlock() {
    await this.page.reload();
    const lockScreen = this.page.getByTestId('lock-screen-wrapper');
    if (await lockScreen.isVisible({ timeout: 15000 })) {
      // console.log('Test Helper: App locked after reload. Unlocking...');
      await expect(this.page.getByTestId('pin-pad-1').first()).toBeVisible();
      for (const char of '123456') {
        await this.page.keyboard.press(char);
        await this.page.waitForTimeout(100);
      }
      await expect(this.chatListTitle).toBeVisible({ timeout: 15000 });
    } else {
      await this.page.waitForLoadState('networkidle');
    }
  }

  /**
   * Create a mock contact directly in storage via exposed service
   * AND updates the Zustand store to avoid reload
   */
  async createMockContact(name: string) {
    await this.ensureMasterKey();

    // Generate unique fingerprint based on name and time to avoid collisions
    const fingerprint = `TESTFP_${Date.now()}_${name.replace(/\s/g, '_')}`;

    await this.page.evaluate(
      async ({ name, fingerprint }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const storage = (window as any).nahanStorage;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const store = (window as any).useAppStore?.getState();

        if (!storage) throw new Error('Storage service not exposed on window');

        const newContact = await storage.storeContact(
          {
            name,
            fingerprint,
            publicKey: 'MOCK_PK_' + fingerprint,
          },
          '123456',
        );

        // Manual Store Update to avoid reload
        if (store) {
          store.addContact(newContact);
        }
      },
      { name, fingerprint },
    );

    // Give React time to re-render after store update
    await this.page.waitForTimeout(500);
  }

  async createMockMessage(contactName: string, content: string) {
    await this.ensureMasterKey();

    await this.page.evaluate(
      async ({ contactName, content }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const storage = (window as any).nahanStorage;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const store = (window as any).useAppStore?.getState();

        if (!storage) throw new Error('Storage service not exposed');

        const contacts = await storage.getContacts('123456');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const contact = contacts.find((c: any) => c.name === contactName);
        if (!contact) throw new Error(`Contact ${contactName} not found for message creation`);

        const newMessage = await storage.storeMessage(
          {
            senderFingerprint: contact.fingerprint, // Incoming message
            recipientFingerprint: 'MY_FINGERPRINT', // Doesn't matter much for list display
            content: {
              plain: content,
              encrypted: 'MOCK_ENCRYPTED',
            },
            isOutgoing: false,
            read: false,
            status: 'sent',
          },
          '123456',
        );

        // Manual Store Update for Chat List Preview
        if (store) {
          store.updateSummaryForContact(contact.fingerprint, newMessage);
        }
      },
      { contactName, content },
    );

    // Give React time to re-render
    await this.page.waitForTimeout(500);
  }

  async getContactItem(name: string): Promise<Locator> {
    return this.page.getByTestId(`chat-item-${name}`);
  }

  async openContextMenu(name: string) {
    const item = await this.getContactItem(name);
    // Simulating long press or right click depending on platform
    // For desktop web, right click (contextmenu) is often mapped to long press logic in tests if implemented that way
    // But the app uses `useLongPress` which listens for touch/mouse down.
    // In previous test, dispatchEvent('contextmenu') was used. Let's stick to that if it triggers the menu.
    // Wait, the app code has `onLongPress` which opens the menu.
    // And `ChatListItem` has `onLongPress` prop.
    // The `useLongPress` hook usually handles mouse/touch events.
    // The previous test tried to simulate mouse hold.
    // Let's try `dispatchEvent('contextmenu')` first as it's cleaner if supported.
    // If not, we simulate the mouse hold.

    // Actually, looking at ChatList.tsx, there is NO onContextMenu handler on the item.
    // It only relies on `bindLongPress`.
    // So `dispatchEvent('contextmenu')` might NOT work unless `useLongPress` handles it (some do).
    // The previous test skip comment said: "Enter Selection Mode via long press simulation".
    // So I should implement a robust long press simulation.

    const box = await item.boundingBox();
    if (!box) throw new Error(`Contact ${name} not found`);

    await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await this.page.mouse.down();
    await this.page.waitForTimeout(2000); // Threshold is 500ms, using 2000ms for slow environments
    await this.page.mouse.up();

    // Verify menu is open by checking one of the options
    await expect(this.selectButton).toBeVisible({ timeout: 15000 });
  }

  async enterSelectionMode(name: string) {
    await this.openContextMenu(name);
    await this.selectButton.click();
    await expect(this.page.getByText('1 selected')).toBeVisible();
    // Wait for the selection menu trigger (bulk actions) to be stable in the header
    await expect(this.selectionMenuTrigger).toBeVisible({ timeout: 10000 });
    await expect(this.selectionMenuTrigger).toBeEnabled({ timeout: 10000 });
  }

  async selectContact(name: string) {
    const item = await this.getContactItem(name);
    await item.click();
  }

  async selectContactInMode(name: string) {
    // In selection mode, clicking toggles selection
    const item = await this.getContactItem(name);
    await item.click();
  }
}
