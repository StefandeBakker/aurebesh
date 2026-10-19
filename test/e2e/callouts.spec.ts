import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { caretToEnd, content, expect, open, selectAll, undo } from './helpers';

/** The HTML as it is given out: clean, without what a browser adds while editing. */
const html = (page: Page): Promise<string> => page.evaluate(() => (window as any).ed.instance.getHTML());

const start = async (page: Page, initial = '<p>one</p><p>two</p>', extra: Record<string, unknown> = {}) => {
  await open(page, initial);
  await page.evaluate((o) => ((window as any).ed.options = { toolbar: ['bold', 'callout'], ...o }), extra);
  await page.locator('.aurebesh-cmd-callout').waitFor();
};
const pick = async (page: Page, type: string) => {
  await page.locator('.aurebesh-cmd-callout').click();
  await page.locator(`.aurebesh-callout-option[data-callout-type="${type}"]`).click();
};

test.describe('the callout button', () => {
  test('puts the selected blocks in a callout of the chosen type, in one step for undo', async ({ page }) => {
    await start(page);
    await selectAll(page);
    await pick(page, 'tip');
    expect(await html(page)).toBe('<div data-callout="tip"><p>one</p><p>two</p></div>');
    await undo(page);
    expect(await html(page)).toBe('<p>one</p><p>two</p>');
  });

  test('changes the type of the callout the caret is in, and takes it away with the same type or "no callout"', async ({ page }) => {
    await start(page, '<div data-callout="note"><p>one</p></div>');
    await content(page).locator('p').click();
    await pick(page, 'warning');
    expect(await html(page)).toBe('<div data-callout="warning"><p>one</p></div>');
    await page.locator('.aurebesh-cmd-callout').click();
    await expect(page.locator('.aurebesh-callout-option[data-callout-type="warning"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.aurebesh-callout-option[data-callout-type=""]').click();
    expect(await html(page)).toBe('<p>one</p>');
  });

  test('only touches the block with the caret', async ({ page }) => {
    await start(page);
    await content(page).locator('p').first().click();
    await pick(page, 'note');
    expect(await html(page)).toBe('<div data-callout="note"><p>one</p></div><p>two</p>');
  });
});

test.describe('typing in a callout', () => {
  test('Enter on an empty last line leaves the callout, Backspace at the start takes it away', async ({ page }) => {
    await start(page, '<div data-callout="note"><p>one</p></div>');
    await caretToEnd(page);
    await page.keyboard.press('Enter');
    await page.keyboard.type('two');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('after');
    expect(await html(page)).toBe('<div data-callout="note"><p>one</p><p>two</p></div><p>after</p>');
    await content(page).locator('[data-callout] p').first().click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Backspace');
    expect(await html(page)).toBe('<p>one</p><p>two</p><p>after</p>');
  });
});

test.describe('the slash menu', () => {
  test('opens at the start of a line, is a listbox with an active option, and is picked with the keyboard', async ({ page }) => {
    await start(page, '<p>one</p>');
    await caretToEnd(page);
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');
    const menu = page.locator('.aurebesh-slash');
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute('role', 'listbox');
    await expect(menu.locator('[role="option"][aria-selected="true"]')).toHaveCount(1);
    await expect(content(page)).toHaveAttribute('aria-activedescendant', /aurebesh-slash-\d+-0/);
    await page.keyboard.type('warn');
    await expect(menu.locator('[role="option"]')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(menu).toBeHidden();
    await page.keyboard.type('Careful');
    expect(await html(page)).toBe('<p>one</p><div data-callout="warning"><p>Careful</p></div>');
  });

  test('moves with the arrow keys, closes with Escape and keeps the text', async ({ page }) => {
    await start(page, '<p>one</p>');
    await caretToEnd(page);
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.aurebesh-slash [role="option"]').nth(1)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Escape');
    await expect(page.locator('.aurebesh-slash')).toBeHidden();
    expect(await html(page)).toBe('<p>one</p><p>/</p>');
  });

  test('stays open while the list itself scrolls, so the last items can be reached', async ({ page }) => {
    await start(page, '<p>one</p>');
    await caretToEnd(page);
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');
    const menu = page.locator('.aurebesh-slash');
    expect(await menu.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    await menu.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await page.keyboard.press('ArrowUp'); // to the last item, which scrolls the list
    await expect(menu).toBeVisible();
    await expect(menu.locator('[role="option"]').last()).toBeInViewport();
  });

  test('stays closed in the middle of a word, and when the option is off', async ({ page }) => {
    await start(page, '<p>one</p>');
    await caretToEnd(page);
    await page.keyboard.type(' a/b');
    await expect(page.locator('.aurebesh-slash')).toBeHidden();
    await start(page, '<p>one</p>', { slash: false });
    await caretToEnd(page);
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');
    await expect(page.locator('.aurebesh-slash')).toHaveCount(0);
  });
});

test.describe('the output', () => {
  test('has the callout as a div with its type, and a custom type with its colour', async ({ page }) => {
    await start(page, '<p>one</p>', { callouts: [{ id: 'deal', label: 'Deal', color: '#ff0066' }] });
    await selectAll(page);
    await pick(page, 'deal');
    expect(await html(page)).toBe('<div data-callout="deal"><p>one</p></div>');
    const border = await content(page).locator('[data-callout]').evaluate((el) => getComputedStyle(el).borderLeftColor);
    expect(border).toBe('rgb(255, 0, 102)');
  });
});
