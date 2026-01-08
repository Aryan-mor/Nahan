import { Page, expect } from '@playwright/test';

export class AuthPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Navigate to root
   */
  async goto() {
    await this.page.goto('/');
    await expect(this.page.locator('body')).toBeVisible();
  }

  /**
   * Perform Full UI Signup
   */
  async performSignup(name: string, pin: string) {
    // 1. Language (if present)
    const engBtn = this.page.getByTestId('lang-en-btn');
    if (await engBtn.isVisible({ timeout: 2000 })) await engBtn.click();

    // 2. Welcome "Start Now" (or Continue in Browser)
    const startBtn = this.page.getByTestId('welcome-start-button');
    if (await startBtn.isVisible({ timeout: 5000 })) {
      await startBtn.click();
      await expect(startBtn).toBeHidden();
    }

    // 3. Create PIN
    await expect(this.page.getByTestId('onboarding-create-pin')).toBeVisible({ timeout: 10000 });
    await this.enterPin(pin);

    // 4. Confirm PIN
    await expect(this.page.getByTestId('onboarding-confirm-pin')).toBeVisible();
    await this.enterPin(pin);

    // 5. Warning Step
    await expect(this.page.getByTestId('warning-checkbox')).toBeVisible();
    await this.page.getByTestId('warning-checkbox').click();
    await this.page.getByTestId('warning-continue-button').click();

    // 6. Identity
    await expect(this.page.getByTestId('display-name-input')).toBeVisible();
    await this.page.getByTestId('display-name-input').fill(name);
    await this.page.getByTestId('generate-identity-button').click();

    // 7. Wait for Dashboard
    await this.verifyDashboard();
  }

  /**
   * Perform Login (Unlock)
   */
  async performLogin(pin: string) {
    await expect(this.page.getByTestId('lock-screen-wrapper')).toBeVisible();
    await this.enterPin(pin);
    // Auto-submit handles it
    // await this.page.getByTestId('pin-pad-enter').click();
    await this.verifyDashboard();
  }

  /**
   * Helper to click pin pad buttons
   */
  async enterPin(pin: string) {
    for (const char of pin) {
      await this.page.getByTestId(`pin-pad-${char}`).click();
    }
  }

  /**
   * Verify we are on the dashboard
   */
  async verifyDashboard() {
    await expect(this.page.getByTestId('nav-chats-tab')).toBeVisible({ timeout: 15000 });
  }
}
