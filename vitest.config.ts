import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (file: string) => fileURLToPath(new URL(`./src/${file}`, import.meta.url));

// Unit tests only; the browser tests in test/e2e are run by Playwright.
// The Angular wrapper imports the package by its name (as an application does): here that is the source.
export default defineConfig({
  resolve: { alias: [{ find: /^aurebesh\/element$/, replacement: src('element.ts') }, { find: /^aurebesh$/, replacement: src('index.ts') }] },
  test: { environment: 'jsdom', include: ['test/*.test.ts', 'angular/test/*.test.ts'] },
});
