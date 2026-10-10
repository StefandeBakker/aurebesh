import { defineConfig } from 'vitest/config';

// Unit tests only; the browser tests in test/e2e are run by Playwright.
export default defineConfig({ test: { environment: 'jsdom', include: ['test/*.test.ts'] } });
