import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { button, content, expect, html, open, undo } from './helpers';

const MERGED =
  '<p>before</p><table><tbody><tr><td>a1</td><td colspan="2">b1c1</td></tr><tr><td>a2</td><td>b2</td><td>c2</td></tr><tr><td rowspan="2">a3</td><td>b3</td><td>c3</td></tr><tr><td>b4</td><td>c4</td></tr></tbody></table><p>after</p>';

const cell = (page: Page, text: string) => content(page).locator('td', { hasText: new RegExp(`^${text}$`) });
const where = (page: Page) =>
  page.evaluate(() => {
    const node = getSelection()!.anchorNode!;
    const el = node.nodeType === 1 ? (node as Element) : node.parentElement!;
    const c = el.closest('td,th');
    return c ? c.textContent!.replace(/\s+/g, ' ').trim() : `outside:${el.closest('p')?.textContent}`;
  });
/** The text on the clipboard, with the line ends of the platform made into \n. */
const clipboard = (page: Page) => page.evaluate(async () => (await navigator.clipboard.readText()).split('\r\n').join('\n'));
const goto = async (page: Page, text: string, key = 'End') => {
  await cell(page, text).click();
  await page.keyboard.press(key);
};

test.describe('up and down through the grid of a table with merged cells', () => {
  test('down goes to the cell below on the screen, not to the next one in the HTML', async ({ page }) => {
    await open(page, MERGED);
    await goto(page, 'c2');
    await page.keyboard.press('ArrowDown');
    expect(await where(page)).toBe('c3');
    await page.keyboard.press('ArrowDown');
    expect(await where(page)).toBe('c4');
    await goto(page, 'b3');
    await page.keyboard.press('ArrowDown');
    expect(await where(page)).toBe('b4');
  });

  test('up goes to the cell above, also into a cell that spans two columns', async ({ page }) => {
    await open(page, MERGED);
    await goto(page, 'b4');
    await page.keyboard.press('ArrowUp');
    expect(await where(page)).toBe('b3');
    await page.keyboard.press('ArrowUp');
    expect(await where(page)).toBe('b2');
    await page.keyboard.press('ArrowUp');
    expect(await where(page)).toBe('b1c1');
    await goto(page, 'c2');
    await page.keyboard.press('ArrowUp');
    expect(await where(page)).toBe('b1c1'); // the same cell covers both columns
  });

  test('from a cell that spans two rows, down goes to the row after both, and up to the one before', async ({ page }) => {
    await open(page, MERGED);
    await goto(page, 'a3');
    await page.keyboard.press('ArrowUp');
    expect(await where(page)).toBe('a2');
    await goto(page, 'a3');
    await page.keyboard.press('ArrowDown');
    expect(await where(page)).toBe('outside:after'); // the table has nothing below it
  });

  test('inside a cell with several lines the arrows move between the lines first', async ({ page }) => {
    await open(page, '<table><tbody><tr><td>top</td></tr><tr><td>line one<br>line two<br>line three</td></tr><tr><td>bottom</td></tr></tbody></table><p>x</p>');
    await cell(page, 'top').click();
    await page.keyboard.press('ArrowDown');
    expect(await where(page)).toBe('line oneline twoline three');
    const line = () => page.evaluate(() => getSelection()!.getRangeAt(0).getClientRects()[0]?.top ?? 0);
    const first = await line();
    await page.keyboard.press('ArrowDown');
    expect(await where(page)).toBe('line oneline twoline three'); // still in the cell, a line lower
    expect(await line()).toBeGreaterThan(first);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    expect(await where(page)).toBe('bottom');
    await page.keyboard.press('ArrowUp');
    expect(await where(page)).toBe('line oneline twoline three');
  });

  test('the caret stays about where it was from side to side', async ({ page }) => {
    await open(page, '<table><tbody><tr><td>short</td><td>a long text in the second column</td></tr><tr><td>x</td><td>another long text, the same width</td></tr></tbody></table><p>z</p>');
    await cell(page, 'a long text in the second column').click();
    const x = (await cell(page, 'a long text in the second column').boundingBox())!;
    await page.mouse.click(x.x + 150, x.y + x.height / 2);
    const before = await page.evaluate(() => getSelection()!.getRangeAt(0).getClientRects()[0].left);
    await page.keyboard.press('ArrowDown');
    const after = await page.evaluate(() => getSelection()!.getRangeAt(0).getClientRects()[0].left);
    expect(Math.abs(after - before)).toBeLessThan(12);
    expect(await where(page)).toBe('another long text, the same width');
  });

  test('typing carries on in the cell the caret went to, and the text did not change', async ({ page }) => {
    await open(page, MERGED);
    await goto(page, 'c2');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.type('!');
    expect(await html(page)).toMatch(/<td>(?:!c3|c3!)<\/td>/);
  });

  test('moving with the arrows does not send a change event', async ({ page }) => {
    await open(page, MERGED);
    await page.evaluate(() => ((window as any).changes = 0));
    await page.evaluate(() => (window as any).ed.addEventListener('change', () => (window as any).changes++));
    await goto(page, 'c2');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    expect(await page.evaluate(() => (window as any).changes)).toBe(0);
  });
});

test.describe('Tab', () => {
  test('Shift+Tab in the first cell goes to the end of what is before the table', async ({ page }) => {
    await open(page, MERGED);
    await goto(page, 'a1', 'Home');
    await page.keyboard.press('Shift+Tab');
    expect(await where(page)).toBe('outside:before');
    await page.keyboard.type('X');
    expect(await html(page)).toContain('<p>beforeX</p>');
  });

  test('Tab and Shift+Tab still walk the cells, and Tab in the last cell adds a row', async ({ page }) => {
    await open(page, '<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table><p>z</p>');
    await goto(page, 'a', 'Home');
    await page.keyboard.press('Tab');
    expect(await where(page)).toBe('b');
    await page.keyboard.press('Shift+Tab');
    expect(await where(page)).toBe('a');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    expect(await content(page).locator('tr').count()).toBe(2);
  });
});

test.describe('copying and pasting rows and columns', () => {
  const TABLE = '<table><tbody><tr><th>h1</th><th>h2</th><th>h3</th></tr><tr><td>a2</td><td style="background-color: #fef08a">b2</td><td>c2</td></tr><tr><td>a3</td><td>b3</td><td>c3</td></tr></tbody></table><p>z</p>';
  const texts = (page: Page) =>
    content(page).evaluate((c) => Array.from(c.querySelectorAll('tr')).map((tr) => Array.from(tr.cells).map((x) => x.textContent).join('|')));

  test('the paste buttons are off until something was copied, and a row cannot be pasted as a column', async ({ page }) => {
    await open(page, TABLE);
    await cell(page, 'a2').click();
    await expect(button(page, 'Paste row below')).toBeDisabled();
    await expect(button(page, 'Paste column right')).toBeDisabled();
    await button(page, 'Copy row').click();
    await expect(button(page, 'Paste row below')).toBeEnabled();
    await expect(button(page, 'Paste column right')).toBeDisabled();
    await button(page, 'Copy column').click();
    await expect(button(page, 'Paste row below')).toBeDisabled();
    await expect(button(page, 'Paste column right')).toBeEnabled();
  });

  test('a row is pasted below the row of the cell under the caret, with its cells and how they look', async ({ page }) => {
    await open(page, TABLE);
    await cell(page, 'b2').click();
    await button(page, 'Copy row').click();
    await cell(page, 'a3').click();
    await button(page, 'Paste row below').click();
    expect(await texts(page)).toEqual(['h1|h2|h3', 'a2|b2|c2', 'a3|b3|c3', 'a2|b2|c2']);
    expect(await content(page).locator('tr').nth(3).locator('td').nth(1).getAttribute('style')).toMatch(/background-color/);
    await button(page, 'Paste row below').click(); // the caret is in the new row now: again below it
    expect(await texts(page)).toHaveLength(5);
  });

  test('the rows of a selection are all copied', async ({ page }) => {
    await open(page, TABLE);
    const a = (await cell(page, 'a2').boundingBox())!;
    const b = (await cell(page, 'b3').boundingBox())!;
    await page.mouse.move(a.x + 10, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
    await page.mouse.up();
    await button(page, 'Copy row').click();
    await content(page).locator('th').first().click();
    await button(page, 'Paste row below').click();
    expect(await texts(page)).toEqual(['h1|h2|h3', 'a2|b2|c2', 'a3|b3|c3', 'a2|b2|c2', 'a3|b3|c3']);
  });

  test('a column is pasted right of the column of the cell under the caret, in every row', async ({ page }) => {
    await open(page, TABLE);
    await cell(page, 'b2').click();
    await button(page, 'Copy column').click();
    await cell(page, 'c3').click();
    await button(page, 'Paste column right').click();
    expect(await texts(page)).toEqual(['h1|h2|h3|h2', 'a2|b2|c2|b2', 'a3|b3|c3|b3']);
    expect(await content(page).locator('tr').nth(0).locator('th').nth(3).count()).toBe(1); // the header cell stays a header cell
  });

  test('copied rows can go into another table, and pasting is one step for undo', async ({ page }) => {
    await open(page, TABLE + '<table><tbody><tr><td>x1</td><td>x2</td></tr></tbody></table>');
    await cell(page, 'a3').click();
    await button(page, 'Copy row').click();
    await cell(page, 'x1').click();
    await button(page, 'Paste row below').click();
    expect((await texts(page)).slice(-2)).toEqual(['x1|x2', 'a3|b3']); // a row of three cells in a table of two columns: the extra one is left out
    await undo(page);
    expect((await texts(page)).slice(-1)).toEqual(['x1|x2']);
  });

  test('the rows are also on the clipboard, as text for a spreadsheet', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'the clipboard can only be read in Chromium here');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page, TABLE);
    await cell(page, 'b3').click();
    await button(page, 'Copy row').click();
    await expect.poll(() => clipboard(page)).toBe('a3\tb3\tc3');
    await cell(page, 'a2').click();
    await button(page, 'Copy column').click();
    await expect.poll(() => clipboard(page)).toBe('h1\na2\na3');
  });

  test('pasting a row beside a merged cell makes that cell taller, as adding a row does', async ({ page }) => {
    await open(page, MERGED);
    await cell(page, 'b2').click();
    await button(page, 'Copy row').click();
    await cell(page, 'b3').click();
    await button(page, 'Paste row below').click();
    const rows = await content(page).evaluate((c) => Array.from(c.querySelectorAll('tr')).map((tr) => Array.from(tr.cells).map((x) => x.textContent).join('|')));
    expect(rows).toEqual(['a1|b1c1', 'a2|b2|c2', 'a3|b3|c3', 'b2|c2', 'b4|c4']); // the new row has no cell of its own where a3 reaches down
    expect(await cell(page, 'a3').getAttribute('rowspan')).toBe('3');
  });
});
