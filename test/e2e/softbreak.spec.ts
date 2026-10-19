import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { content, expect, open } from './helpers';

const html = (page: Page): Promise<string> => page.evaluate(() => (window as any).ed.instance.getHTML());
const md = (page: Page): Promise<string> => page.evaluate(() => (window as any).ed.instance.getMarkdown());

/** Shift+Enter after the first letter of the first block, then a letter. */
const softBreak = async (page: Page, initial: string, selector: string) => {
  await open(page, initial);
  await content(page).locator(selector).first().click();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('X');
};

test.describe('Shift+Enter', () => {
  const cases: [string, string, string, string][] = [
    ['a paragraph', '<p>ab</p>', 'p', '<p>a<br>Xb</p>'],
    ['a list item', '<ul><li>ab</li></ul>', 'li', '<ul><li>a<br>Xb</li></ul>'],
    ['a heading', '<h1>ab</h1>', 'h1', '<h1>a<br>Xb</h1>'],
    ['a quote', '<blockquote>ab</blockquote>', 'blockquote', '<blockquote>a<br>Xb</blockquote>'],
    ['a callout', '<div data-callout="note"><p>ab</p></div>', 'p', '<div data-callout="note"><p>a<br>Xb</p></div>'],
    ['a task', '<ul data-task=""><li>ab</li></ul>', 'li', '<ul data-task=""><li>a<br>Xb</li></ul>'],
    ['a table cell', '<table><tbody><tr><td>ab</td></tr></tbody></table>', 'td', '<table><tbody><tr><td>a<br>Xb</td></tr></tbody></table>'],
  ];
  for (const [name, initial, selector, expected] of cases) {
    test(`makes a line break in ${name}, not a new block`, async ({ page }) => {
      await softBreak(page, initial, selector);
      expect(await html(page)).toBe(expected);
    });
  }

  test('Enter still starts a new block', async ({ page }) => {
    await open(page, '<p>ab</p>');
    await content(page).locator('p').click();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await page.keyboard.type('X');
    expect(await html(page)).toBe('<p>a</p><p>Xb</p>');
  });

  test('at the end of a block, without typing, leaves no extra break in the output, and typing goes on the new line', async ({ page }) => {
    await open(page, '<p>ab</p>');
    await content(page).locator('p').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+Enter');
    expect(await html(page)).toBe('<p>ab<br></p>');
    await page.keyboard.type('cd');
    expect(await html(page)).toBe('<p>ab<br>cd</p>');
  });

  test('is undone as one step', async ({ page }) => {
    await open(page, '<p>ab</p>');
    await content(page).locator('p').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.press('Control+Z');
    expect(await html(page)).toBe('<p>ab</p>');
  });

  test('is a break in the Markdown, and the Markdown gives the same HTML back', async ({ page }) => {
    await softBreak(page, '<p>ab</p>', 'p');
    expect(await md(page)).toBe('a  \nXb');
    await page.evaluate(() => (window as any).ed.instance.setMarkdown('a  \nXb'));
    expect(await html(page)).toBe('<p>a<br>Xb</p>');
  });

  test('does not touch the code block, where it already is a new line', async ({ page }) => {
    await open(page, '<pre>ab</pre>');
    await content(page).locator('pre').click();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('X');
    expect(await html(page)).toBe('<pre>a\nXb</pre>');
  });
});
