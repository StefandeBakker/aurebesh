import { test, expect } from '@playwright/test';

// The same four checks for both frameworks.
for (const framework of ['react', 'vue'] as const) {
  test.describe(`${framework} wrapper`, () => {
    const content = (page: import('@playwright/test').Page) => page.locator('.aurebesh-content');

    test.beforeEach(async ({ page }) => {
      await page.goto(`/test/e2e/${framework}.html`);
      await content(page).waitFor();
    });

    test('renders the initial value and applies the options', async ({ page }) => {
      await expect(content(page)).toContainText('start');
      await expect(page.locator('.aurebesh-toolbar button[title="Vet"]')).toHaveCount(1);
      await expect(page.locator('.aurebesh-toolbar button')).toHaveCount(2);
    });

    test('typing updates the parent state and keeps focus, even though options is re-created on every render', async ({ page }) => {
      await content(page).click();
      await page.keyboard.press('End');
      await page.keyboard.type(' and some more text');
      await expect(page.locator('#out')).toContainText('start and some more text');
      await expect(content(page)).toContainText('start and some more text');
    });

    test('a value changed by the parent shows up in the editor', async ({ page }) => {
      await page.locator('#reset').click();
      await expect(content(page)).toContainText(`from ${framework}`);
      await expect(content(page)).not.toContainText('start');
    });

    test('the editor takes part in the surrounding form', async ({ page }) => {
      await content(page).click();
      await page.keyboard.press('End');
      await page.keyboard.type('!');
      const value = await page.evaluate(() => new FormData(document.getElementById('form') as HTMLFormElement).get('body'));
      expect(value).toContain('start!');
    });
  });
}
