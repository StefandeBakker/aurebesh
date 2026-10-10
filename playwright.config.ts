import { defineConfig, devices } from '@playwright/test';

// Real-browser tests: Chromium, Firefox and WebKit (the engine behind Safari).
export default defineConfig({
  testDir: 'test/e2e',
  globalSetup: './test/e2e/build-apps.mjs',
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5199', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run demo',
    url: 'http://localhost:5199/test/e2e/page.html',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
