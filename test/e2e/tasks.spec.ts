import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { caretToEnd, content, expect, open } from './helpers';

const html = (page: Page): Promise<string> => page.evaluate(() => (window as any).ed.instance.getHTML());

const start = async (page: Page, initial: string, extra: Record<string, unknown> = {}) => {
  await open(page, initial);
  await page.evaluate((o) => ((window as any).ed.options = { toolbar: ['bold', 'ul', 'task'], ...o }), extra);
  await page.locator('.aurebesh-cmd-task').waitFor();
};
const LIST = '<ul data-task=""><li>one</li><li data-checked="true">two</li></ul>';

test.describe('the task list button', () => {
  test('makes a paragraph a task list, and an ordinary list again', async ({ page }) => {
    await start(page, '<p>one</p>');
    await content(page).locator('p').click();
    await page.locator('.aurebesh-cmd-task').click();
    expect(await html(page)).toBe('<ul data-task=""><li>one</li></ul>');
    await expect(page.locator('.aurebesh-cmd-task')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.aurebesh-cmd-task').click();
    expect(await html(page)).toBe('<ul><li>one</li></ul>');
  });

  test('makes a bullet list a task list', async ({ page }) => {
    await start(page, '<ul><li>one</li><li>two</li></ul>');
    await content(page).locator('li').first().click();
    await page.locator('.aurebesh-cmd-task').click();
    expect(await html(page)).toBe('<ul data-task=""><li>one</li><li>two</li></ul>');
  });

  test('has a shortcut, Mod+Shift+9', async ({ page }) => {
    await start(page, '<p>one</p>');
    await content(page).locator('p').click();
    await page.keyboard.press('Control+Shift+9');
    expect(await html(page)).toBe('<ul data-task=""><li>one</li></ul>');
  });
});

test.describe('checking', () => {
  test('a click on the box checks and unchecks, and the caret stays where it was', async ({ page }) => {
    await start(page, LIST);
    await content(page).locator('li').nth(1).click();
    const li = content(page).locator('li').first();
    const box = await li.boundingBox();
    await page.mouse.click(box!.x + 6, box!.y + 6);
    expect(await html(page)).toBe('<ul data-task=""><li data-checked="true">one</li><li data-checked="true">two</li></ul>');
    await page.mouse.click(box!.x + 6, box!.y + 6);
    expect(await html(page)).toBe(LIST);
    await page.keyboard.type('X');
    expect(await html(page)).toContain('twoX');
  });

  test('a click on the text only puts the caret there', async ({ page }) => {
    await start(page, LIST);
    await content(page).locator('li').first().click();
    expect(await html(page)).toBe(LIST);
  });

  test('Ctrl+Enter checks and unchecks the item with the caret', async ({ page }) => {
    await start(page, LIST);
    await content(page).locator('li').first().click();
    await page.keyboard.press('Control+Enter');
    expect(await html(page)).toBe('<ul data-task=""><li data-checked="true">one</li><li data-checked="true">two</li></ul>');
    await page.keyboard.press('Control+Enter');
    expect(await html(page)).toBe(LIST);
  });

  test('cannot be checked when the editor is read-only', async ({ page }) => {
    await start(page, LIST, { readOnly: true });
    const li = content(page).locator('li').first();
    const box = await li.boundingBox();
    await page.mouse.click(box!.x + 6, box!.y + 6);
    expect(await html(page)).toBe(LIST);
  });
});

test.describe('typing in a task list', () => {
  test('Enter makes a new item that is not checked, also after a checked one', async ({ page }) => {
    await start(page, LIST);
    await caretToEnd(page);
    await page.keyboard.press('Enter');
    await page.keyboard.type('three');
    expect(await html(page)).toBe('<ul data-task=""><li>one</li><li data-checked="true">two</li><li>three</li></ul>');
  });

  test('Enter on an empty item leaves the list', async ({ page }) => {
    await start(page, LIST);
    await caretToEnd(page);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('after');
    const out = await html(page);
    expect(out.startsWith(LIST)).toBe(true);
    expect(out.slice(LIST.length)).toContain('after');
  });

  test('Tab makes a list inside the item, which is a task list too, and Shift+Tab takes it back', async ({ page }) => {
    await start(page, '<ul data-task=""><li>one</li><li>two</li></ul>');
    await content(page).locator('li').nth(1).click();
    await page.keyboard.press('Tab');
    expect(await html(page)).toBe('<ul data-task=""><li>one<ul data-task=""><li>two</li></ul></li></ul>');
    await page.keyboard.press('Control+Enter');
    expect(await html(page)).toBe('<ul data-task=""><li>one<ul data-task=""><li data-checked="true">two</li></ul></li></ul>');
    await page.keyboard.press('Shift+Tab');
    expect(await html(page)).toBe('<ul data-task=""><li>one</li><li data-checked="true">two</li></ul>');
  });
});

test.describe('the slash menu and the output', () => {
  test('the slash menu has the task list', async ({ page }) => {
    await start(page, '<p>one</p>', { toolbar: ['bold', 'callout', 'task'] });
    await caretToEnd(page);
    await page.keyboard.press('Enter');
    await page.keyboard.type('/task');
    await page.keyboard.press('Enter');
    await page.keyboard.type('buy milk');
    expect(await html(page)).toBe('<p>one</p><ul data-task=""><li>buy milk</li></ul>');
  });

  test('the box is drawn by CSS and the markdown has it', async ({ page }) => {
    await start(page, LIST);
    const before = await content(page).locator('li').nth(1).evaluate((el) => getComputedStyle(el, '::before').backgroundColor);
    expect(before).toBe('rgb(37, 99, 235)');
    expect(await page.evaluate(() => (window as any).ed.instance.getMarkdown())).toBe('- [ ] one\n- [x] two');
  });
});
