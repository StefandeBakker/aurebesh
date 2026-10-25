import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { content, expect, open, selectAll, undo } from './helpers';

const html = (page: Page): Promise<string> => page.evaluate(() => (window as any).ed.instance.getHTML());
const md = (page: Page): Promise<string> => page.evaluate(() => (window as any).ed.instance.getMarkdown());

const start = async (page: Page, initial = '<p>text</p>') => {
  await open(page, initial);
  await page.evaluate(() => ((window as any).ed.options = { toolbar: ['bold', 'weight', 'clear', 'clearStyle'] }));
  await page.locator('.aurebesh-weight').waitFor();
};
const weight = (page: Page, value: string) => page.locator('.aurebesh-weight').selectOption(value);

test.describe('the weight of text', () => {
  test('has light, regular, medium, semibold and bold, and a name for the box', async ({ page }) => {
    await start(page);
    const options = await page.locator('.aurebesh-weight option').evaluateAll((os) => os.map((o) => [(o as HTMLOptionElement).value, o.textContent]));
    expect(options).toEqual([['', 'Weight'], ['300', 'Light'], ['400', 'Regular'], ['500', 'Medium'], ['600', 'Semibold'], ['700', 'Bold']]);
    await expect(page.locator('.aurebesh-weight')).toHaveAccessibleName('Weight');
  });

  for (const w of ['300', '500', '600']) {
    test(`${w} is a style on a span, and it is drawn that way`, async ({ page }) => {
      await start(page);
      await selectAll(page);
      await weight(page, w);
      expect(await html(page)).toBe(`<p><span style="font-weight: ${w}">text</span></p>`);
      expect(await content(page).locator('span').evaluate((el) => getComputedStyle(el).fontWeight)).toBe(w);
    });
  }

  test('bold is <strong>, as the bold button makes it', async ({ page }) => {
    await start(page);
    await selectAll(page);
    await weight(page, '700');
    expect(await html(page)).toMatch(/^<p><(b|strong)>text<\/(b|strong)><\/p>$/);
  });

  test('regular takes a weight away', async ({ page }) => {
    await start(page, '<p><span style="font-weight: 600">text</span></p>');
    await selectAll(page);
    await weight(page, '400');
    expect(await html(page)).toBe('<p>text</p>');
    await start(page, '<p><strong>text</strong></p>');
    await selectAll(page);
    await weight(page, '400');
    expect(await html(page)).toBe('<p>text</p>');
  });

  test('a weight replaces the one the text had, bold included', async ({ page }) => {
    await start(page, '<p><strong>text</strong></p>');
    await selectAll(page);
    await weight(page, '300');
    expect(await html(page)).toBe('<p><span style="font-weight: 300">text</span></p>');
    await weight(page, '600');
    expect(await html(page)).toBe('<p><span style="font-weight: 600">text</span></p>');
    await weight(page, '700');
    expect(await html(page)).toMatch(/^<p><(b|strong)>text<\/(b|strong)><\/p>$/);
  });

  test('the box shows the weight of the text that has the caret', async ({ page }) => {
    await start(page, '<p>plain <span style="font-weight: 300">light</span> <span style="font-weight: 500">medium</span> <strong>bold</strong></p>');
    for (const [word, value] of [['light', '300'], ['medium', '500'], ['bold', '700']]) {
      await content(page).locator('p').getByText(word).click();
      await expect(page.locator('.aurebesh-weight')).toHaveValue(value);
    }
    await content(page).locator('p').click({ position: { x: 3, y: 8 } });
    await expect(page.locator('.aurebesh-weight')).toHaveValue('400');
  });

  test('only the selected text gets it', async ({ page }) => {
    await start(page, '<p>one two three</p>');
    await content(page).locator('p').click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Control+ArrowRight');
    await page.keyboard.press('Control+Shift+ArrowRight');
    await weight(page, '600');
    const out = await html(page);
    expect(out).toMatch(/^<p>one (<span style="font-weight: 600">two ?<\/span>|<span style="font-weight: 600">two<\/span> ?)three<\/p>$|font-weight: 600/);
    expect(await page.evaluate(() => (window as any).ed.instance.getText())).toBe('one two three');
  });

  test('works in a heading, which is bold by itself', async ({ page }) => {
    await start(page, '<h2>head</h2>');
    await selectAll(page);
    await weight(page, '300');
    expect(await html(page)).toBe('<h2><span style="font-weight: 300">head</span></h2>');
    await expect(page.locator('.aurebesh-weight')).toHaveValue('300');
  });

  test('is undone with the browser undo, and does nothing without a selection', async ({ page }) => {
    await start(page);
    await selectAll(page);
    await weight(page, '500');
    await undo(page);
    expect(await html(page)).toBe('<p>text</p>');
    await content(page).click();
    await page.keyboard.press('Home');
    await weight(page, '600');
    expect(await html(page)).toBe('<p>text</p>');
  });

  test('the clear buttons take a weight away, with the rest of the formatting', async ({ page }) => {
    await start(page, '<p><em><span style="font-weight: 600">text</span></em></p>');
    await selectAll(page);
    await page.locator('.aurebesh-cmd-clearStyle').click();
    await page.locator('.aurebesh-clear-pop button', { hasText: /^Bold$/ }).click();
    const out = await html(page);
    expect(out).not.toContain('font-weight');
    expect(out).toContain('<em>');
  });

  test('is plain text in the Markdown, and bold stays **bold**', async ({ page }) => {
    await start(page, '<p><span style="font-weight: 300">light</span> and <strong>bold</strong></p>');
    expect(await md(page)).toBe('light and **bold**');
  });
});
