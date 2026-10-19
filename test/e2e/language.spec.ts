import { test } from '@playwright/test';
import { expect, open } from './helpers';

const bold = (page: import('@playwright/test').Page) => page.locator('.aurebesh-cmd-bold');

test.describe('the language of the editor', () => {
  test.describe('a German browser', () => {
    test.use({ locale: 'de-DE' });
    test('shows German texts without being told', async ({ page }) => {
      await open(page);
      await page.evaluate(() => ((window as any).ed.options = { toolbar: ['bold', 'link'] }));
      await expect(bold(page)).toHaveAttribute('title', 'Fett');
      await expect(page.locator('.aurebesh-cmd-link')).toHaveAttribute('title', 'Link einfügen');
    });

    test('follows the lang of the page before the browser, and the language that is asked for before both', async ({ page }) => {
      await open(page);
      await page.evaluate(() => {
        document.documentElement.lang = 'fr';
        (window as any).ed.options = { toolbar: ['bold'] };
      });
      await expect(bold(page)).toHaveAttribute('title', 'Gras');
      await page.evaluate(() => (window as any).ed.setAttribute('language', 'es'));
      await expect(bold(page)).toHaveAttribute('title', 'Negrita');
    });
  });

  test.describe('an English browser', () => {
    test.use({ locale: 'en-GB' });
    test('stays English', async ({ page }) => {
      await open(page);
      await expect(bold(page)).toHaveAttribute('title', 'Bold');
    });
  });

  test.describe('a browser in a language that is not built in', () => {
    test.use({ locale: 'ja-JP' });
    test('falls back to English', async ({ page }) => {
      await open(page);
      await expect(bold(page)).toHaveAttribute('title', 'Bold');
    });
  });
});
