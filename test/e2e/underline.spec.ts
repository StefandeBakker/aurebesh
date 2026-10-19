import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { content, expect, open, selectAll } from './helpers';

const html = (page: Page): Promise<string> => page.evaluate(() => (window as any).ed.instance.getHTML());

const start = async (page: Page, initial = '<p>text</p>') => {
  await open(page, initial);
  await page.evaluate(() => ((window as any).ed.options = { toolbar: ['underline', 'underlineStyle', 'strike', 'strikeStyle'] }));
  await page.locator('.aurebesh-cmd-underlineStyle').waitFor();
};
const openPicker = (page: Page) => page.locator('.aurebesh-cmd-underlineStyle').click();
const option = (page: Page, label: string) => page.locator('.aurebesh-strike-pop:visible .aurebesh-strike-option', { hasText: new RegExp(`^${label}$`) });

test.describe('the look of an underline', () => {
  test('has the five kinds of line, and gives the text an underline that has none', async ({ page }) => {
    await start(page);
    await selectAll(page);
    await openPicker(page);
    await expect(page.locator('.aurebesh-strike-pop:visible .aurebesh-strike-option')).toHaveCount(5);
    await option(page, 'Dashed').click();
    expect(await html(page)).toMatch(/<u style="text-decoration-style: dashed;?">text<\/u>/);
  });

  for (const [label, style] of [['Dotted', 'dotted'], ['Double', 'double'], ['Wavy', 'wavy']]) {
    test(`${label}: the line is drawn that way`, async ({ page }) => {
      await start(page, '<p><u>text</u></p>');
      await selectAll(page);
      await openPicker(page);
      await option(page, label).click();
      expect(await content(page).locator('u').evaluate((el) => getComputedStyle(el).textDecorationStyle)).toBe(style);
    });
  }

  test('back to solid takes the style away, and the current kind is marked', async ({ page }) => {
    await start(page, '<p><u style="text-decoration-style: wavy">text</u></p>');
    await selectAll(page);
    await openPicker(page);
    await expect(option(page, 'Wavy')).toHaveAttribute('aria-pressed', 'true');
    await option(page, 'Solid').click();
    expect(await html(page)).toBe('<p><u>text</u></p>');
  });

  test('a colour that differs from the text, and Automatic takes it away', async ({ page }) => {
    await start(page);
    await selectAll(page);
    await openPicker(page);
    await page.locator('.aurebesh-strike-pop:visible .aurebesh-color-grid button').nth(12).click();
    expect(await html(page)).toContain('text-decoration-color');
    await openPicker(page);
    await page.locator('.aurebesh-strike-pop:visible .aurebesh-color-reset').click();
    expect(await html(page)).toBe('<p><u>text</u></p>');
  });

  test('the caret in an underline is enough, and a strikethrough next to it is not touched', async ({ page }) => {
    await start(page, '<p><u>one</u> <s>two</s></p>');
    await content(page).locator('u').click();
    await openPicker(page);
    await option(page, 'Dotted').click();
    const out = await html(page);
    expect(out).toMatch(/<u style="[^"]*dotted[^"]*">one<\/u>/);
    expect(out).toContain('<s>two</s>');
  });

  test('the strikethrough picker still has its two kinds', async ({ page }) => {
    await start(page);
    await selectAll(page);
    await page.locator('.aurebesh-cmd-strikeStyle').click();
    await expect(page.locator('.aurebesh-strike-pop:visible .aurebesh-strike-option')).toHaveCount(2);
  });
});
