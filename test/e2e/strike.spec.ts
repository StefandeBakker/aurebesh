import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { content, expect, open, selectAll, undo } from './helpers';

const html = (page: Page): Promise<string> => page.evaluate(() => (window as any).ed.instance.getHTML());

const start = async (page: Page, initial = '<p>gone</p>') => {
  await open(page, initial);
  await page.evaluate(() => ((window as any).ed.options = { toolbar: ['strike', 'strikeStyle'] }));
  await page.locator('.aurebesh-cmd-strikeStyle').waitFor();
};
const openPicker = (page: Page) => page.locator('.aurebesh-cmd-strikeStyle').click();

test.describe('the look of a strikethrough', () => {
  test('a double line: the text is struck through first, and the line is double', async ({ page }) => {
    await start(page);
    await selectAll(page);
    await openPicker(page);
    await page.locator('.aurebesh-strike-option').nth(1).click();
    const out = await html(page);
    expect(out).toMatch(/^<(s|strike)[^>]*style="[^"]*text-decoration-style: double[^"]*"[^>]*>gone<\/(s|strike)>$|^<p><(s|strike)[^>]*text-decoration-style: double[^>]*>gone<\/(s|strike)><\/p>$/);
    expect(await content(page).locator('s, strike').first().evaluate((el) => getComputedStyle(el).textDecorationStyle)).toBe('double');
  });

  test('back to a single line takes the style away, and the markup is plain again', async ({ page }) => {
    await start(page, '<p><s style="text-decoration-style: double">gone</s></p>');
    await selectAll(page);
    await openPicker(page);
    await expect(page.locator('.aurebesh-strike-option').nth(1)).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.aurebesh-strike-option').nth(0).click();
    expect(await html(page)).toBe('<p><s>gone</s></p>');
  });

  test('a colour, and "automatic" takes it away again', async ({ page }) => {
    await start(page);
    await selectAll(page);
    await openPicker(page);
    await page.locator('.aurebesh-strike-pop .aurebesh-color-grid button').first().click();
    expect(await html(page)).toContain('text-decoration-color');
    await openPicker(page);
    await page.locator('.aurebesh-strike-pop .aurebesh-color-reset').click();
    expect(await html(page)).not.toContain('text-decoration-color');
    expect(await html(page)).toMatch(/<(s|strike)>gone<\/(s|strike)>/);
  });

  test('only the selected text gets it, and the caret in a strikethrough is enough', async ({ page }) => {
    await start(page, '<p>one <s>two</s> three</p>');
    await content(page).locator('s').click();
    await openPicker(page);
    await page.locator('.aurebesh-strike-option').nth(1).click();
    const out = await html(page);
    expect(out).toContain('one ');
    expect(out).toMatch(/<s style="[^"]*double[^"]*">two<\/s> three/);
  });

  test('the shortcut button for a single line still works as before, and undo takes the line away', async ({ page }) => {
    await start(page);
    await selectAll(page);
    await page.locator('.aurebesh-cmd-strike').click();
    expect(await html(page)).toMatch(/<(s|strike)>gone<\/(s|strike)>/);
    await undo(page);
    expect(await html(page)).toBe('<p>gone</p>');
  });
});
