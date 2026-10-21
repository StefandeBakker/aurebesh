import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { content, expect, open, selectAll, undo } from './helpers';

const html = (page: Page): Promise<string> => page.evaluate(() => (window as any).ed.instance.getHTML());
const md = (page: Page): Promise<string> => page.evaluate(() => (window as any).ed.instance.getMarkdown());

const start = async (page: Page, initial = '<p>text</p>', extra: Record<string, unknown> = {}) => {
  await open(page, initial);
  await page.evaluate((o) => ((window as any).ed.options = { toolbar: ['size', 'bold'], ...o }), extra);
  await page.locator('.aurebesh-size').waitFor();
};
const size = (page: Page) => page.locator('.aurebesh-size');

test.describe('the size of text in points', () => {
  test('has the sizes of a word processor, and says that they are points', async ({ page }) => {
    await start(page);
    const values = await size(page).locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    expect(values).toEqual(['', '8', '9', '10', '11', '12', '14', '16', '18', '20', '24', '28', '32', '36', '48', '72', 'default']);
    await expect(size(page)).toHaveAccessibleName('Size (pt)');
  });

  test('gives the selected text the size, in points, on a span', async ({ page }) => {
    await start(page);
    await selectAll(page);
    await size(page).selectOption('18');
    expect(await html(page)).toBe('<p><span style="font-size: 18pt">text</span></p>');
    expect(await content(page).locator('span').evaluate((el) => getComputedStyle(el).fontSize)).toBe('24px');
  });

  test('a size replaces the one the text had, and "Default" takes it away', async ({ page }) => {
    await start(page, '<p><span style="font-size: 9pt">text</span></p>');
    await selectAll(page);
    await size(page).selectOption('36');
    expect(await html(page)).toBe('<p><span style="font-size: 36pt">text</span></p>');
    await size(page).selectOption('default');
    expect(await html(page)).toBe('<p>text</p>');
  });

  test('only the selected text, and the rest keeps its own size', async ({ page }) => {
    await start(page, '<p>one <span style="font-size: 20pt">two</span> three</p>');
    await content(page).locator('p').click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await size(page).selectOption('10');
    const out = await html(page);
    expect(out).toContain('<span style="font-size: 20pt">two</span>');
    expect(out).toMatch(/<span style="font-size: 10pt">one<\/span>/);
  });

  test('a size on part of a bigger text: the rest keeps its size, and the box shows the new one', async ({ page }) => {
    await start(page, '<p><span style="font-size: 36pt">one two three</span></p>');
    // "two " (a double click selects the space after the word in some browsers, and not in others)
    await page.evaluate(() => {
      const text = document.querySelector('.aurebesh-content span')!.firstChild as Text;
      const range = document.createRange();
      range.setStart(text, 4);
      range.setEnd(text, 8);
      (document.querySelector('.aurebesh-content') as HTMLElement).focus();
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
    });
    await size(page).selectOption('12');
    expect(await html(page)).toBe('<p><span style="font-size: 36pt">one </span><span style="font-size: 12pt">two </span><span style="font-size: 36pt">three</span></p>');
    await expect(size(page)).toHaveValue('12');
    await size(page).selectOption('default');
    expect(await html(page)).toBe('<p><span style="font-size: 36pt">one </span>two <span style="font-size: 36pt">three</span></p>');
  });

  test('a size on a selection over text of several sizes puts one size on all of it, and "Default" takes them all away', async ({ page }) => {
    await start(page, '<p><span style="font-size: 36pt">one</span> two <span style="font-size: 20pt">three</span></p>');
    await selectAll(page);
    await size(page).selectOption('12');
    expect(await html(page)).toBe('<p><span style="font-size: 12pt">one two three</span></p>');
    await size(page).selectOption('default');
    expect(await html(page)).toBe('<p>one two three</p>');
  });

  test('a selection from plain text into a bigger text: only the selected part changes', async ({ page }) => {
    await start(page, '<p>plain <span style="font-size: 36pt">big text</span> after</p>');
    await page.evaluate(() => {
      const c = document.querySelector('.aurebesh-content') as HTMLElement;
      c.focus();
      const plain = c.querySelector('p')!.firstChild!;
      const big = c.querySelector('span')!.firstChild!;
      const r = document.createRange();
      r.setStart(plain, 3);
      r.setEnd(big, 3);
      const s = getSelection()!;
      s.removeAllRanges();
      s.addRange(r);
    });
    await size(page).selectOption('18');
    expect(await html(page)).toBe('<p>pla<span style="font-size: 18pt">in big</span><span style="font-size: 36pt"> text</span> after</p>');
  });

  test('a size can be chosen again and again, and the box follows every time', async ({ page }) => {
    await start(page);
    await selectAll(page);
    for (const value of ['36', '12', '20', '9', '48']) {
      await size(page).selectOption(value);
      await expect(size(page)).toHaveValue(value);
      expect(await html(page)).toBe(`<p><span style="font-size: ${value}pt">text</span></p>`);
    }
  });

  test('with only a caret, the size is for the text that is typed next', async ({ page }) => {
    await start(page);
    await content(page).click();
    await page.keyboard.press('End');
    await size(page).selectOption('20');
    await expect(size(page)).toHaveValue('20');
    await page.keyboard.type('big');
    const out = await html(page);
    expect(out).toContain('<span style="font-size: 20pt">big</span>');
    expect(out).not.toContain('xxx-large');
  });

  test('shows the size of the text that has the caret, also one that is not in the box', async ({ page }) => {
    await start(page, '<p>plain <span style="font-size: 18pt">big</span> <span style="font-size: 13pt">odd</span></p>');
    for (const [word, value] of [['big', '18'], ['odd', '13']]) {
      await content(page).locator('p').getByText(word).click();
      await expect(size(page)).toHaveValue(value);
    }
    await content(page).locator('p').click({ position: { x: 3, y: 8 } });
    await expect(size(page)).toHaveValue('12');
  });

  test('has the sizes that the option gives', async ({ page }) => {
    await start(page, '<p>text</p>', { sizes: [10, 15, 30, 4, 500, 'x'] });
    const values = await size(page).locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    expect(values).toEqual(['', '10', '15', '30', 'default']);
  });

  test('is undone with the browser undo', async ({ page }) => {
    await start(page);
    await selectAll(page);
    await size(page).selectOption('24');
    await undo(page);
    expect(await html(page)).toBe('<p>text</p>');
  });

  test('works with bold, and the Markdown has the text without the size', async ({ page }) => {
    await start(page, '<p><span style="font-size: 20pt"><strong>text</strong></span></p>');
    expect(await md(page)).toBe('**text**');
  });
});
