import { expect, test } from '@playwright/test';

test.describe('Mobile Tour Targets', () => {
    test.use({ viewport: { width: 375, height: 812 } }); // iPhone X size

    test('should have mobile navigation elements visible after onboarding', async ({ page }) => {
        await page.goto('/');

        // Handle Language Selection
        await page.getByTestId('lang-en-btn').click();

        // Handle Welcome Screen
        const startBtn = page.getByTestId('welcome-start-button');
        await expect(startBtn).toBeVisible({ timeout: 10000 });
        await startBtn.click();

        // Onboarding: Step 1 (Create PIN)
        await expect(page.getByText('Create PIN')).toBeVisible();
        await page.getByTestId('pin-pad-1').click();
        await page.getByTestId('pin-pad-2').click();
        await page.getByTestId('pin-pad-3').click();
        await page.getByTestId('pin-pad-4').click();
        await page.getByTestId('pin-pad-5').click();
        await page.getByTestId('pin-pad-6').click();

        // Step 2: Confirm PIN
        await expect(page.getByText('Confirm PIN')).toBeVisible();
        await page.getByTestId('pin-pad-1').click();
        await page.getByTestId('pin-pad-2').click();
        await page.getByTestId('pin-pad-3').click();
        await page.getByTestId('pin-pad-4').click();
        await page.getByTestId('pin-pad-5').click();
        await page.getByTestId('pin-pad-6').click();

        // Step 3: Warning
        const warningBox = page.getByTestId('warning-checkbox');
        await expect(warningBox).toBeVisible({ timeout: 10000 });
        await warningBox.click();
        await page.getByTestId('warning-continue-button').click();

        // Step 4: Identity
        const nameInput = page.getByTestId('display-name-input');
        await expect(nameInput).toBeVisible({ timeout: 10000 });
        await nameInput.fill('Mobile User');
        await page.getByTestId('generate-identity-button').click();

        // Wait for main screen
        await expect(page.getByTestId('header-help-icon')).toBeVisible();

        const bottomNav = page.locator('nav.md\\:hidden');
        await expect(bottomNav).toBeVisible();

        // Check for specific mobile tab selectors
        await expect(page.getByTestId('nav-mobile-chats')).toBeVisible();
        await expect(page.getByTestId('nav-mobile-keys')).toBeVisible();
        await expect(page.getByTestId('nav-mobile-settings')).toBeVisible();

        // Verify desktop sidebar is HIDDEN
        const sidebar = page.locator('nav.hidden.md\\:flex');
        await expect(sidebar).toBeHidden();
    });
});
