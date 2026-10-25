import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { content, expect, open, selectAll, undo } from './helpers';

const html = (page: Page): Promise<string> => page.evaluate(() => (window as any).ed.instance.getHTML());
const md = (page: Page): Promise<string> => page.evaluate(() => (window as any).ed.instance.getMarkdown());

const start = async (page: Page, initial: string) => {
  await open(page, initial);
  await page.evaluate(() => ((window as any).ed.options = { toolbar: ['bold', 'code', 'sup', 'sub'] }));
  await page.locator('.aurebesh-cmd-code').waitFor();
};
const code = (page: Page) => page.locator('.aurebesh-cmd-code').click();

test.describe('inline code next to other formatting', () => {
  test('keeps bold and links that are in the text, inside the code', async ({ page }) => {
    await start(page, '<p>a <strong>b</strong> <a href="https://x.dev">c</a> d</p>');
    await selectAll(page);
    await code(page);
    expect(await html(page)).toBe('<p><code>a <strong>b</strong> <a href="https://x.dev">c</a> d</code></p>');
  });

  test('takes the code away without taking the bold away', async ({ page }) => {
    await start(page, '<p><code>a <strong>b</strong> c</code></p>');
    await content(page).locator('code').click();
    await code(page);
    expect(await html(page)).toBe('<p>a <strong>b</strong> c</p>');
  });

  test('a selection over two paragraphs gets a piece of code in each, and they stay two paragraphs', async ({ page }) => {
    await start(page, '<p>one</p><p>two</p>');
    await selectAll(page);
    await code(page);
    expect(await html(page)).toBe('<p><code>one</code></p><p><code>two</code></p>');
    await code(page);
    expect(await html(page)).toBe('<p>one</p><p>two</p>');
  });

  test('in a list item, a heading and a table cell', async ({ page }) => {
    await start(page, '<ul><li>item</li></ul><h2>head</h2><table><tbody><tr><td>cell</td></tr></tbody></table>');
    await selectAll(page);
    await code(page);
    const out = await html(page);
    expect(out).toContain('<li><code>item</code></li>');
    expect(out).toContain('<h2><code>head</code></h2>');
    expect(out).toContain('<td><code>cell</code></td>');
  });

  test('part of a word, with the rest of the formatting around it', async ({ page }) => {
    await start(page, '<p><strong>bold text</strong></p>');
    await content(page).locator('strong').click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await code(page);
    const out = await html(page);
    expect(out).toMatch(/<code><strong>bold<\/strong><\/code><strong> text<\/strong>|<strong><code>bold<\/code> text<\/strong>/);
    expect(await page.evaluate(() => (window as any).ed.instance.getText())).toBe('bold text');
  });

  test('does not make code in code, and the same text stays selected (the button undoes it)', async ({ page }) => {
    await start(page, '<p>one <code>two</code> three</p>');
    await selectAll(page);
    await code(page);
    expect(await html(page)).toBe('<p>one two three</p>');
    await code(page);
    expect(await html(page)).toBe('<p><code>one two three</code></p>');
  });

  test('is undone as one step in a block', async ({ page }) => {
    await start(page, '<p>text</p>');
    await selectAll(page);
    await code(page);
    await undo(page);
    expect(await html(page)).toBe('<p>text</p>');
  });

  test('has a visible box, set by CSS variables', async ({ page }) => {
    await start(page, '<p><code>x</code></p>');
    const box = (name: string) => content(page).locator('code').evaluate((el, n) => getComputedStyle(el).getPropertyValue(n), name);
    expect(await box('border-top-width')).toBe('1px');
    await page.evaluate(() => document.documentElement.style.setProperty('--aurebesh-code-bg', 'rgb(255, 0, 0)'));
    await page.evaluate(() => document.documentElement.style.setProperty('--aurebesh-code-padding', '4px 9px'));
    expect(await box('background-color')).toBe('rgb(255, 0, 0)');
    expect(await box('padding-left')).toBe('9px');
  });

  test('is a backtick span in the Markdown, and the shortcut still works', async ({ page }) => {
    await start(page, '<p>text</p>');
    await selectAll(page);
    await page.keyboard.press('Control+E');
    expect(await md(page)).toBe('`text`');
  });
});

test.describe('superscript and subscript', () => {
  const button = (page: Page, name: string) => page.locator(`.aurebesh-cmd-${name}`);

  test('do not go together: the one applied last is the one that stays', async ({ page }) => {
    await start(page, '<p>x</p>');
    await selectAll(page);
    await button(page, 'sup').click();
    expect(await html(page)).toBe('<p><sup>x</sup></p>');
    await button(page, 'sub').click();
    expect(await html(page)).toBe('<p><sub>x</sub></p>');
    await button(page, 'sup').click();
    expect(await html(page)).toBe('<p><sup>x</sup></p>');
  });

  test('toggle off with the same button, and a selection that is partly superscript ends up all in one kind', async ({ page }) => {
    await start(page, '<p>abc<sup>def</sup></p>');
    await selectAll(page);
    await button(page, 'sub').click();
    expect(await html(page)).toBe('<p><sub>abcdef</sub></p>');
    await button(page, 'sub').click();
    expect(await html(page)).toBe('<p>abcdef</p>');
  });

  test('have shortcuts: Mod+. and Mod+,', async ({ page }) => {
    await start(page, '<p>x</p>');
    await selectAll(page);
    await page.keyboard.press('Control+.');
    expect(await html(page)).toBe('<p><sup>x</sup></p>');
    await page.keyboard.press('Control+,');
    expect(await html(page)).toBe('<p><sub>x</sub></p>');
  });

  test('do not change the height of the line', async ({ page }) => {
    await start(page, '<p>plain x and more</p><p>with x<sup>2</sup> and x<sub>i</sub></p>');
    const heights = await content(page).locator('p').evaluateAll((ps) => ps.map((p) => p.getBoundingClientRect().height));
    expect(heights[1]).toBeCloseTo(heights[0], 0);
  });

  test('work in bigger text and inside inline code', async ({ page }) => {
    await start(page, '<h1>H<sub>2</sub>O</h1><p><code>x<sup>2</sup></code></p>');
    const size = (sel: string) => content(page).locator(sel).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const h1 = await size('h1');
    expect(await size('sub')).toBeCloseTo(h1 * 0.75, 0);
    expect(await md(page)).toContain('`x2`'); // Markdown has no superscript inside code
  });

  test('are <sup> and <sub> in the HTML, and in the Markdown', async ({ page }) => {
    await start(page, '<p>x<sup>2</sup> H<sub>2</sub>O</p>');
    expect(await html(page)).toBe('<p>x<sup>2</sup> H<sub>2</sub>O</p>');
    expect(await md(page)).toBe('x<sup>2</sup> H<sub>2</sub>O');
    await page.evaluate(() => (window as any).ed.instance.setMarkdown('x<sup>2</sup> H<sub>2</sub>O'));
    expect(await html(page)).toBe('<p>x<sup>2</sup> H<sub>2</sub>O</p>');
  });
});
