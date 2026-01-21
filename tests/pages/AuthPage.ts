import { Locator, Page, expect } from '@playwright/test';

export class AuthPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Navigate to root
   */
  async goto() {
    // Inject flag to disable TourGuide
    await this.page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__NAHAN_IS_AUTOMATED__ = true;
    });
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

    await this.handleWelcomeScreen();

    // 3. Create PIN
    const createPinStep = this.page.getByTestId('onboarding-create-pin');

    // Sometimes transition from Welcome to Create PIN takes longer or animation blocks it
    await expect(createPinStep).toBeVisible({ timeout: 120000 });
    await this.enterPin(pin, createPinStep);

    // 4. Confirm PIN
    const confirmPinStep = this.page.getByTestId('onboarding-confirm-pin');
    await expect(confirmPinStep).toBeVisible();
    await this.enterPin(pin, confirmPinStep);

    // 5. Warning Step
    const warningCheckbox = this.page.getByTestId('warning-checkbox');
    const warningContinue = this.page.getByTestId('warning-continue-button');

    await expect(warningCheckbox).toBeVisible();
    await warningCheckbox.click();

    await expect(warningContinue).toBeEnabled(); // Wait for state update
    await warningContinue.click();

    // 6. Identity
    const nameInput = this.page.getByTestId('display-name-input');
    const genBtn = this.page.getByTestId('generate-identity-button');

    await expect(nameInput).toBeVisible();
    await nameInput.fill(name);

    await expect(genBtn).toBeEnabled();
    await genBtn.click();

    // 7. Wait for Dashboard
    await this.verifyDashboard();
  }

  private async handleWelcomeScreen() {
    // 2. Intelligent Wait for Welcome OR Create PIN
    try {
      await this.page.waitForLoadState('domcontentloaded');
      const welcomeOrPin = await this.page.waitForSelector(
        '[data-testid="welcome-start-button"], [data-testid="onboarding-create-pin"]',
        { timeout: 120000 },
      );

      const testId = await welcomeOrPin.getAttribute('data-testid');
      if (testId === 'welcome-start-button') {
        await welcomeOrPin.click();
        await expect(this.page.getByTestId('welcome-start-button')).toBeHidden();
      }
    } catch (_e) {
      // console.log('Timeout waiting for Welcome or Create PIN');
    }
  }

  /**
   * Perform Login (Unlock)
   */
  async performLogin(pin: string) {
    const lockScreen = this.page.getByTestId('lock-screen-wrapper');
    await expect(lockScreen).toBeVisible();
    await this.enterPin(pin, lockScreen);
    // Auto-submit handles it
    await this.verifyDashboard();
  }

  /**
   * Helper to click pin pad buttons (refactored to use Keyboard for stability)
   */
  async enterPin(pin: string, context?: Locator) {
    // Wait for the specific container to be visible if provided
    if (context) {
      await expect(context).toBeVisible();
    }

    // Ensure the keypad UI is generally ready (checking first button existence/visibility)
    // This confirms the component is mounted and listener is likely attached
    await expect(this.page.getByTestId('pin-pad-1').first()).toBeVisible({ timeout: 30000 });

    // Use keyboard input which is handled by window listener in PinPad.tsx
    // varying delay to ensure state updates propagate
    for (const char of pin) {
      await this.page.keyboard.press(char);
      await this.page.waitForTimeout(100);
    }
  }

  /**
   * Verify we are on the dashboard
   */
  async verifyDashboard() {
    // Check for either Desktop OR Mobile Chats tab
    // IDs: 'nav-chats' (Desktop) or 'nav-mobile-chats' (Mobile)
    const desktop = this.page.getByTestId('nav-chats');
    const mobile = this.page.getByTestId('nav-mobile-chats');

    await expect(desktop.or(mobile).first()).toBeVisible({ timeout: 90000 });
  }
}
