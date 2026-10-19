import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { content, expect, open, selectAll, undo } from './helpers';

const html = (page: Page): Promise<string> => page.evaluate(() => (window as any).ed.instance.getHTML());

const start = async (page: Page, initial: string) => {
  await open(page, initial);
  await page.evaluate(() => ((window as any).ed.options = { toolbar: ['bold', 'clear', 'clearStyle'] }));
  await page.locator('.aurebesh-cmd-clearStyle').waitFor();
};
const choose = async (page: Page, label: string) => {
  await page.locator('.aurebesh-cmd-clearStyle').click();
  await page.locator('.aurebesh-clear-pop button', { hasText: new RegExp(`^${label}$`) }).click();
};

const RICH = '<p><strong><em><u>text</u></em></strong></p>';

test.describe('clearing one kind of formatting', () => {
  test('takes bold away and keeps italic and underline', async ({ page }) => {
    await start(page, RICH);
    await selectAll(page);
    await choose(page, 'Bold');
    const out = await html(page);
    expect(out).not.toMatch(/<(strong|b)[ >]/);
    expect(out).toMatch(/<em>/);
    expect(out).toMatch(/<u>/);
  });

  test('takes italic, underline and strikethrough away, one by one', async ({ page }) => {
    await start(page, '<p><strong><em><u><s>text</s></u></em></strong></p>');
    await selectAll(page);
    await choose(page, 'Italic');
    expect(await html(page)).not.toMatch(/<(em|i)[ >]/);
    await choose(page, 'Underline');
    expect(await html(page)).not.toMatch(/<u[ >]/);
    await choose(page, 'Strikethrough');
    expect(await html(page)).not.toMatch(/<(s|strike|del)[ >]/);
    expect(await html(page)).toMatch(/<(strong|b)>/);
  });

  test('where only part of the selection is bold, all of it ends up not bold', async ({ page }) => {
    await start(page, '<p>one <strong>two</strong> three</p>');
    await selectAll(page);
    await choose(page, 'Bold');
    expect(await html(page)).not.toMatch(/<(strong|b)[ >]/);
    expect(await html(page)).toContain('one');
    expect(await html(page)).toContain('three');
  });

  test('only the selected text is cleared', async ({ page }) => {
    await start(page, '<p><strong>one two</strong></p>');
    await content(page).locator('strong').dblclick(); // selects a word
    await choose(page, 'Bold');
    const out = await html(page);
    expect(out).toMatch(/<strong>[^<]*<\/strong>/);
    expect(out.replace(/<[^>]+>/g, '')).toBe('one two');
  });

  test('takes colour and highlight away on their own', async ({ page }) => {
    await start(page, '<p><span style="color: #dc2626; background-color: #facc15"><strong>text</strong></span></p>');
    await selectAll(page);
    await choose(page, 'Text color');
    let out = await html(page);
    expect(out).not.toMatch(/(^|[^-])color: ?#dc2626|rgb\(220, 38, 38\)/);
    expect(out).toMatch(/background-color/);
    await choose(page, 'Highlight color');
    out = await html(page);
    expect(out).not.toMatch(/background-color: ?(#facc15|rgb\(250, 204, 21\))/);
    expect(out).toMatch(/<(strong|b)>/);
  });

  test('"Clear formatting" in the list, and the shortcut, take everything away', async ({ page }) => {
    await start(page, RICH);
    await selectAll(page);
    await choose(page, 'Clear formatting');
    expect(await html(page)).toBe('<p>text</p>');
    await undo(page);
    await page.keyboard.press('Control+\\');
    expect(await html(page)).toBe('<p>text</p>');
  });

  test('a kind that the selected text does not have is greyed out', async ({ page }) => {
    await start(page, '<p><em>text</em></p>');
    await selectAll(page);
    await page.locator('.aurebesh-cmd-clearStyle').click();
    const option = (label: string) => page.locator('.aurebesh-clear-pop button', { hasText: new RegExp(`^${label}$`) });
    await expect(option('Italic')).toBeEnabled();
    await expect(option('Bold')).toBeDisabled();
    await expect(option('Underline')).toBeDisabled();
  });

  test('is undone in the steps of the browser, and does nothing without a selection', async ({ page }) => {
    await start(page, '<p><strong>text</strong></p>');
    await selectAll(page);
    await choose(page, 'Bold');
    await undo(page);
    expect(await html(page)).toMatch(/<(strong|b)>text/);
    await content(page).click();
    await page.keyboard.press('Home');
    await page.locator('.aurebesh-cmd-clearStyle').click();
    await expect(page.locator('.aurebesh-clear-pop button', { hasText: /^Bold$/ })).toBeDisabled();
  });
});
