import { test } from '@playwright/test';
import { button, content, expect, open, type } from './helpers';

const formValue = (page: import('@playwright/test').Page) =>
  page.evaluate(() => new FormData(document.getElementById('form') as HTMLFormElement).get('body'));

test.describe('form integration and labels', () => {
  test('the HTML is submitted with the form under the element name', async ({ page }) => {
    await open(page);
    await type(page, 'hello');
    expect(await formValue(page)).toContain('hello');
  });

  test('an empty editor submits an empty value and `required` blocks the form until there is content', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).ed.setAttribute('required', ''));
    expect(await formValue(page)).toBe('');
    expect(await page.evaluate(() => (document.getElementById('form') as HTMLFormElement).checkValidity())).toBe(false);
    await type(page, 'x');
    expect(await page.evaluate(() => (document.getElementById('form') as HTMLFormElement).checkValidity())).toBe(true);
  });

  test('form.reset() restores the initial content', async ({ page }) => {
    await open(page);
    await type(page, 'typed');
    await page.evaluate(() => (document.getElementById('form') as HTMLFormElement).reset());
    await expect(content(page)).not.toContainText('typed');
  });

  test('the labels option translates the toolbar', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      (window as any).ed.options = { labels: { bold: 'Vet', 'ui.font': 'Lettertype' } };
    });
    await expect(page.locator('button[title="Vet"]')).toHaveCount(1);
    await expect(page.locator('select.aurebesh-font')).toHaveAttribute('title', 'Lettertype');
    await expect(button(page, 'Italic')).toHaveCount(1); // untouched labels keep the default
  });

  test('changing options keeps what was typed', async ({ page }) => {
    await open(page);
    await type(page, 'keep me');
    await page.evaluate(() => {
      (window as any).ed.options = { toolbar: ['bold'] };
    });
    await expect(content(page)).toContainText('keep me');
    await expect(page.locator('.aurebesh-toolbar button')).toHaveCount(1);
  });
});
