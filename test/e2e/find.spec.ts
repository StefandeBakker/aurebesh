import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { content, expect, open, undo } from './helpers';

const html = (page: Page): Promise<string> => page.evaluate(() => (window as any).ed.instance.getHTML());
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
const bar = (page: Page) => page.locator('.aurebesh-find');
const input = (page: Page) => page.locator('.aurebesh-find-input').first();
const count = (page: Page) => page.locator('.aurebesh-find-count');
const marks = (page: Page, name = 'aurebesh-find'): Promise<string[]> =>
  page.evaluate((n) => {
    const h = (CSS as any).highlights?.get(n);
    return h ? Array.from(h as Iterable<Range>).map((r) => r.toString()) : [];
  }, name);

const START = '<p>The cat sat on the mat. Another Cat came; the category is cat.</p><p>A <strong>cat</strong>nap.</p>';

const start = async (page: Page, initial = START, extra: Record<string, unknown> = {}) => {
  await open(page, initial);
  if (Object.keys(extra).length) await page.evaluate((o) => ((window as any).ed.options = o), extra);
  await content(page).click();
};
const find = async (page: Page, text: string) => {
  await page.keyboard.press(`${MOD}+F`);
  await input(page).fill(text);
};

test.describe('finding', () => {
  test('opens with Mod+F, with the focus in the box, and closes with Escape', async ({ page }) => {
    await start(page);
    await expect(bar(page)).toBeHidden();
    await page.keyboard.press(`${MOD}+F`);
    await expect(bar(page)).toBeVisible();
    await expect(input(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(bar(page)).toBeHidden();
    await expect(content(page)).toBeFocused();
  });

  test('marks every match, says how many there are, and goes from one to the next with Enter', async ({ page }) => {
    await start(page);
    await find(page, 'cat');
    await expect(count(page)).toHaveText('1 of 5');
    expect(await marks(page)).toHaveLength(5);
    expect(await marks(page, 'aurebesh-find-current')).toEqual(['cat']);
    await page.keyboard.press('Enter');
    await expect(count(page)).toHaveText('2 of 5');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.press('Shift+Enter');
    await expect(count(page)).toHaveText('5 of 5'); // round the end
  });

  test('has options for the case and for whole words', async ({ page }) => {
    await start(page);
    await find(page, 'cat');
    await expect(count(page)).toHaveText('1 of 5');
    await page.locator('.aurebesh-find-case').click();
    await expect(page.locator('.aurebesh-find-case')).toHaveAttribute('aria-pressed', 'true');
    await expect(count(page)).toHaveText('1 of 4'); // not "Cat"
    await page.locator('.aurebesh-find-word').click();
    await expect(count(page)).toHaveText('1 of 2'); // not "category", and not "catnap" (over the bold)
    await page.locator('.aurebesh-find-case').click();
    await expect(count(page)).toHaveText('1 of 3');
  });

  test('says when there is nothing, and marks nothing', async ({ page }) => {
    await start(page);
    await find(page, 'zebra');
    await expect(count(page)).toHaveText('No results');
    expect(await marks(page)).toEqual([]);
  });

  test('takes the selected text as the text to find', async ({ page }) => {
    await start(page);
    await page.evaluate(() => {
      const text = document.querySelector('.aurebesh-content p')!.firstChild as Text;
      const range = document.createRange();
      range.setStart(text, 4); // "cat"
      range.setEnd(text, 7);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
    });
    await page.keyboard.press(`${MOD}+F`);
    await expect(input(page)).toHaveValue('cat');
    await expect(count(page)).toHaveText('1 of 5');
  });

  test('keeps up with the text: typing in it changes what is found', async ({ page }) => {
    await start(page, '<p>cat</p>');
    await find(page, 'cat');
    await expect(count(page)).toHaveText('1 of 1');
    await content(page).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' cat cat');
    await expect(count(page)).toHaveText(/of 3$/);
  });

  test('leaves the current match selected when it closes', async ({ page }) => {
    await start(page);
    await find(page, 'mat');
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => getSelection()!.toString())).toBe('mat');
  });

  test('is there from the button in the strip above the toolbar, and not with find: false', async ({ page }) => {
    await start(page);
    await page.locator('.aurebesh-quickbar button[title="Find and replace"]').click();
    await expect(bar(page)).toBeVisible();
    await start(page, START, { find: false });
    await page.keyboard.press(`${MOD}+F`);
    await expect(bar(page)).toBeHidden();
  });

  test('is not there in the HTML view', async ({ page }) => {
    await start(page, START, { modes: true });
    await page.evaluate(() => (window as any).ed.instance.setMode('html'));
    await page.evaluate(() => (window as any).ed.instance.openFind());
    await expect(bar(page)).toHaveCount(0);
  });
});

test.describe('replacing', () => {
  const replaceRow = (page: Page) => page.locator('.aurebesh-find-replace-row');

  test('Mod+H shows the row to replace with, and the arrow in the bar too', async ({ page }) => {
    await start(page);
    await page.keyboard.press(`${MOD}+F`);
    await expect(replaceRow(page)).toBeHidden();
    await page.locator('.aurebesh-find-toggle').click();
    await expect(replaceRow(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press(`${MOD}+H`);
    await expect(replaceRow(page)).toBeVisible();
  });

  test('replaces one match, goes on to the next, and the undo of the browser takes it back', async ({ page }) => {
    await start(page, '<p>cat and cat and cat</p>');
    await page.keyboard.press(`${MOD}+H`);
    await input(page).fill('cat');
    await page.locator('.aurebesh-find-replace-input').fill('dog');
    await page.locator('.aurebesh-find-replace').click();
    expect(await html(page)).toBe('<p>dog and cat and cat</p>');
    await expect(count(page)).toHaveText('1 of 2');
    await page.locator('.aurebesh-find-replace').click();
    expect(await html(page)).toBe('<p>dog and dog and cat</p>');
    await content(page).click();
    await undo(page);
    await undo(page);
    expect(await html(page)).toBe('<p>cat and cat and cat</p>');
  });

  test('replaces all of them, over the blocks and the formatting, and says how many', async ({ page }) => {
    await start(page, '<p>cat and <strong>cat</strong></p><ul><li>a cat</li></ul><table><tbody><tr><td>cat</td></tr></tbody></table>');
    await page.keyboard.press(`${MOD}+H`);
    await input(page).fill('cat');
    await page.locator('.aurebesh-find-replace-input').fill('dog');
    await page.locator('.aurebesh-find-replace-all').click();
    const out = await html(page);
    expect(out).not.toContain('cat');
    expect(out.match(/dog/g)).toHaveLength(4);
    expect(out).toContain('<strong>dog</strong>');
    await expect(count(page)).toHaveText('Replaced 4');
  });

  test('has a button that takes a replace all back, as long as the text is not changed', async ({ page }) => {
    const initial = '<p>one two one</p>';
    await start(page, initial);
    await page.keyboard.press(`${MOD}+H`);
    await input(page).fill('one');
    await page.locator('.aurebesh-find-replace-input').fill('1');
    await page.locator('.aurebesh-find-replace-all').click();
    expect(await html(page)).toBe('<p>1 two 1</p>');
    await page.locator('.aurebesh-find-undo').click();
    expect(await html(page)).toBe(initial);
    await expect(page.locator('.aurebesh-find-undo')).toBeHidden();
    await page.locator('.aurebesh-find-replace-all').click();
    await content(page).click();
    await page.keyboard.press('End');
    await page.keyboard.type('!');
    await expect(page.locator('.aurebesh-find-undo')).toBeHidden(); // the text changed: nothing to take back
  });

  test('replaces with nothing, and never reads the replacement as markup', async ({ page }) => {
    await start(page, '<p>a x b x</p>');
    await page.keyboard.press(`${MOD}+H`);
    await input(page).fill('<i>');
    await expect(count(page)).toHaveText('No results');
    await input(page).fill(' x');
    await page.locator('.aurebesh-find-replace-all').click();
    expect(await html(page)).toBe('<p>a b</p>');
    await input(page).fill('a');
    await page.locator('.aurebesh-find-replace-input').fill('<b>x</b>');
    await page.locator('.aurebesh-find-replace-all').click();
    expect(await html(page)).toBe('<p>&lt;b&gt;x&lt;/b&gt; b</p>');
  });

  test('cannot replace in a read-only editor', async ({ page }) => {
    await start(page, START, { readOnly: true });
    await page.evaluate(() => (window as any).ed.instance.openFind({ replace: true }));
    await expect(bar(page)).toBeVisible();
    await expect(page.locator('.aurebesh-find-toggle')).toBeHidden();
    await expect(replaceRow(page)).toBeHidden();
  });
});
