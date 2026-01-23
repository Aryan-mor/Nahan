import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // Run tests serially to ensure proper cleanup
  forbidOnly: !!process.env.CI,
  timeout: 180000,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  expect: {
    timeout: 30000,
  },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    actionTimeout: 30000,
  launchOptions: {
      slowMo: 100,
  },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
  reporter: [
    ['html', { open: 'never' }],
    ['list']
  ],
});
