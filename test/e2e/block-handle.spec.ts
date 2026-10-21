import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { content, expect, open, undo } from './helpers';

const html = (page: Page): Promise<string> => page.evaluate(() => (window as any).ed.instance.getHTML());
const handle = (page: Page) => page.locator('.aurebesh-blockhandle');
const menu = (page: Page) => page.locator('.aurebesh-blockmenu');
const item = (page: Page, name: string) => menu(page).getByRole('menuitem', { name, exact: true }).or(menu(page).getByRole('menuitemradio', { name, exact: true }));

const START = '<p>first</p><h2>second</h2><p>third</p>';

const start = async (page: Page, initial = START, options: Record<string, unknown> = {}) => {
  await open(page, initial);
  if (Object.keys(options).length) await page.evaluate((o) => ((window as any).ed.options = o), options);
  await content(page).locator('p, h2').first().waitFor();
};
const hover = async (page: Page, selector: string, nth = 0) => {
  await content(page).locator(selector).nth(nth).hover();
  await expect(handle(page)).toBeVisible();
};

test.describe('the handle of a block', () => {
  test('shows beside the block under the pointer, and follows it from block to block', async ({ page }) => {
    await start(page);
    await hover(page, 'h2');
    const box = (await handle(page).boundingBox())!;
    const block = (await content(page).locator('h2').boundingBox())!;
    expect(box.x).toBeLessThan(block.x + 10);
    expect(Math.abs(box.y - block.y)).toBeLessThan(12);
    await content(page).locator('p').last().hover();
    await expect.poll(async () => Math.round((await handle(page).boundingBox())!.y)).toBeGreaterThan(Math.round(block.y + block.height - 4));
  });

  test('is hidden when the pointer leaves, when typing, and not there at all when it is turned off or read-only', async ({ page }) => {
    await start(page);
    await hover(page, 'p');
    await page.mouse.move(2, 2);
    await expect(handle(page)).toBeHidden();
    await hover(page, 'p');
    await content(page).click();
    await page.keyboard.type('x');
    await expect(handle(page)).toBeHidden();
    await start(page, START, { blockHandles: false });
    await content(page).locator('p').first().hover();
    await expect(handle(page)).toHaveCount(0);
    await start(page, START, { readOnly: true });
    await content(page).locator('p').first().hover();
    await expect(handle(page)).toBeHidden();
  });

  test('has a name and says that it opens a menu', async ({ page }) => {
    await start(page);
    await hover(page, 'p');
    await expect(handle(page)).toHaveAccessibleName('Drag to move, click for options');
    await expect(handle(page)).toHaveAttribute('aria-haspopup', 'menu');
    await expect(handle(page)).toHaveAttribute('draggable', 'true');
  });
});

test.describe('the menu of a block', () => {
  test('opens with a click, with the actions and what the block can be turned into, and closes with Escape', async ({ page }) => {
    await start(page);
    await hover(page, 'h2');
    await handle(page).click();
    await expect(menu(page)).toBeVisible();
    await expect(handle(page)).toHaveAttribute('aria-expanded', 'true');
    for (const name of ['Duplicate', 'Move up', 'Move down', 'Delete', 'Paragraph', 'Heading 1', 'Heading 2', 'Bullet list', 'Quote', 'Code block', 'Callout']) {
      await expect(item(page, name), name).toBeVisible();
    }
    await expect(item(page, 'Heading 2')).toHaveAttribute('aria-checked', 'true'); // what it is now
    await page.keyboard.press('Escape');
    await expect(menu(page)).toBeHidden();
    await expect(content(page)).toBeFocused();
  });

  test('can be used with the arrow keys', async ({ page }) => {
    await start(page);
    await hover(page, 'p');
    await handle(page).click();
    await expect(item(page, 'Duplicate')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(item(page, 'Move down')).toBeFocused(); // Move up is not available for the first block
    await page.keyboard.press('Enter');
    expect(await html(page)).toBe('<h2>second</h2><p>first</p><p>third</p>');
  });

  test('duplicates and deletes the block', async ({ page }) => {
    await start(page);
    await hover(page, 'h2');
    await handle(page).click();
    await item(page, 'Duplicate').click();
    expect(await html(page)).toBe('<p>first</p><h2>second</h2><h2>second</h2><p>third</p>');
    await hover(page, 'h2', 1);
    await handle(page).click();
    await item(page, 'Delete').click();
    expect(await html(page)).toBe('<p>first</p><h2>second</h2><p>third</p>');
  });

  test('moves the block up and down, and a move can be undone', async ({ page }) => {
    await start(page);
    await hover(page, 'h2');
    await handle(page).click();
    await item(page, 'Move up').click();
    expect(await html(page)).toBe('<h2>second</h2><p>first</p><p>third</p>');
    await undo(page);
    expect(await html(page)).toBe(START);
  });

  test('turns the block into another kind, with its text and formatting', async ({ page }) => {
    await start(page, '<p>one <strong>two</strong></p>');
    await hover(page, 'p');
    await handle(page).click();
    await item(page, 'Heading 1').click();
    expect(await html(page)).toBe('<h1>one <strong>two</strong></h1>');
    await hover(page, 'h1');
    await handle(page).click();
    await item(page, 'Task list').click();
    expect(await html(page)).toBe('<ul data-task=""><li>one <strong>two</strong></li></ul>');
    await hover(page, 'li');
    await handle(page).click();
    await item(page, 'Callout').click();
    expect(await html(page)).toBe('<div data-callout="note"><p>one <strong>two</strong></p></div>');
  });

  test('has no "turn into" for a table, but it can be moved and deleted', async ({ page }) => {
    await start(page, '<p>a</p><table><tbody><tr><td>x</td></tr></tbody></table><p>b</p>');
    await hover(page, 'table');
    await handle(page).click();
    await expect(item(page, 'Delete')).toBeVisible();
    await expect(item(page, 'Heading 1')).toHaveCount(0);
    await item(page, 'Move down').click();
    expect(await html(page)).toBe('<p>a</p><p>b</p><table><tbody><tr><td>x</td></tr></tbody></table>');
  });
});

test.describe('moving a block by dragging', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'Playwright cannot drive HTML5 drag and drop in WebKit (it is covered in Chromium and Firefox)');
  test('puts it where it is dropped, and says where with a line while dragging', async ({ page }) => {
    await start(page);
    await hover(page, 'p');
    const target = (await content(page).locator('p').last().boundingBox())!;
    await handle(page).dragTo(content(page).locator('p').last(), { targetPosition: { x: 20, y: target.height - 3 } });
    expect(await html(page)).toBe('<h2>second</h2><p>third</p><p>first</p>');
    expect(await page.locator('.aurebesh-blockdrop').count()).toBe(0); // the line is gone after the drop
    await expect(page.locator('.aurebesh-moving')).toHaveCount(0);
  });

  test('a drop onto the block itself does nothing', async ({ page }) => {
    await start(page);
    await hover(page, 'h2');
    await handle(page).dragTo(content(page).locator('h2'), { targetPosition: { x: 120, y: 8 } }); // over the block, away from the handle
    expect(await html(page)).toBe(START);
  });

  test('is a step for undo', async ({ page }) => {
    await start(page);
    await hover(page, 'p');
    const target = (await content(page).locator('p').last().boundingBox())!;
    await handle(page).dragTo(content(page).locator('p').last(), { targetPosition: { x: 20, y: target.height - 3 } });
    await content(page).click();
    await undo(page);
    expect(await html(page)).toBe(START);
  });
});

test.describe('blocks in columns and in a page layout', () => {
  const ROW = '<div data-layout="row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px"><div data-layout="col" style="min-width: 0"><p>left</p><h2>left two</h2></div><div data-layout="col" style="min-width: 0"><p>right</p></div></div>';

  test('a block in a column has a handle of its own, and the row has one too', async ({ page }) => {
    await start(page, `<p>top</p>${ROW}<p>bottom</p>`);
    await hover(page, '[data-layout="col"] h2');
    const inColumn = (await handle(page).boundingBox())!;
    const h2 = (await content(page).locator('h2').boundingBox())!;
    expect(Math.abs(inColumn.y - h2.y)).toBeLessThan(12);
    await handle(page).click();
    await item(page, 'Move up').click();
    expect(await html(page)).toContain('<div data-layout="col" style="min-width: 0"><h2>left two</h2><p>left</p></div>');
    await page.keyboard.press('Escape');
    await content(page).locator('[data-layout="col"]').nth(1).hover({ position: { x: 4, y: 40 } }); // the padding of a column: the row
    await expect(handle(page)).toBeVisible();
  });

  test('a block can be dragged from a column to the text and the other way', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright cannot drive HTML5 drag and drop in WebKit (it is covered in Chromium and Firefox)');
    await start(page, `<p>top</p>${ROW}<p>bottom</p>`);
    await hover(page, '[data-layout="col"]:nth-child(2) p');
    const bottom = (await content(page).locator('p', { hasText: 'bottom' }).boundingBox())!;
    await handle(page).dragTo(content(page).locator('p', { hasText: 'bottom' }), { targetPosition: { x: 20, y: bottom.height - 3 } });
    const out = await html(page);
    expect(out.indexOf('right')).toBeGreaterThan(out.indexOf('bottom'));
    expect(out).toMatch(/<div data-layout="col"[^>]*><p><br><\/p><\/div>/); // the column that was left has a paragraph to type in
  });

  test('works in a page format too: the handle is beside the sheet', async ({ page }) => {
    await start(page, START, { page: 'a4' });
    await hover(page, 'h2');
    const box = (await handle(page).boundingBox())!;
    const block = (await content(page).locator('h2').boundingBox())!;
    expect(box.x).toBeLessThan(block.x + 10);
    expect(Math.abs(box.y - block.y)).toBeLessThan(14);
    await handle(page).click();
    await item(page, 'Move down').click();
    expect(await html(page)).toBe('<p>first</p><p>third</p><h2>second</h2>');
  });
});

test.describe('the keyboard', () => {
  test('Alt+Shift+Up and Alt+Shift+Down move the block with the caret, and the caret goes with it', async ({ page }) => {
    await start(page);
    await content(page).locator('h2').click();
    await page.keyboard.press('Alt+Shift+ArrowUp');
    expect(await html(page)).toBe('<h2>second</h2><p>first</p><p>third</p>');
    await page.keyboard.type('X');
    expect(await html(page)).toContain('<h2>');
    expect(await html(page)).toMatch(/X/);
    await page.keyboard.press('Alt+Shift+ArrowDown');
    await page.keyboard.press('Alt+Shift+ArrowDown');
    expect(await html(page)).toMatch(/<p>first<\/p><p>third<\/p><h2>[^<]*X[^<]*<\/h2>/);
  });

  test('Alt+Shift+M opens the menu of the block with the caret', async ({ page }) => {
    await start(page);
    await content(page).locator('h2').click();
    await page.keyboard.press('Alt+Shift+KeyM');
    await expect(menu(page)).toBeVisible();
    await expect(item(page, 'Heading 2')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    await expect(menu(page)).toBeHidden();
  });
});

test.describe('undo and redo of what the handle does', () => {
  test('Ctrl+Z takes a move back and Ctrl+Y does it again, also after the menu of the browser', async ({ page }) => {
    await start(page);
    await content(page).locator('h2').click();
    await page.keyboard.press('Alt+Shift+ArrowUp');
    expect(await html(page)).toBe('<h2>second</h2><p>first</p><p>third</p>');
    await page.keyboard.press('Control+Z');
    expect(await html(page)).toBe(START);
    await page.keyboard.press('Control+Y');
    expect(await html(page)).toBe('<h2>second</h2><p>first</p><p>third</p>');
    await page.keyboard.press('Control+Shift+Z');
    expect(await html(page)).toBe('<h2>second</h2><p>first</p><p>third</p>');
    await page.keyboard.press('Control+Z');
    await page.keyboard.press('Control+Shift+Z');
    expect(await html(page)).toBe('<h2>second</h2><p>first</p><p>third</p>');
  });

  test('goes in the order of what was done: typing after a move is undone first, then the move', async ({ page }) => {
    await start(page);
    await content(page).locator('h2').click();
    await page.keyboard.press('Alt+Shift+ArrowDown');
    await page.keyboard.press('End');
    await page.keyboard.type('XYZ');
    expect(await html(page)).toContain('XYZ');
    await page.keyboard.press('Control+Z'); // the typing
    expect(await html(page)).not.toContain('XYZ');
    expect(await html(page)).toBe('<p>first</p><p>third</p><h2>second</h2>');
    await page.keyboard.press('Control+Z'); // the move
    expect(await html(page)).toBe(START);
  });

  test('the undo and redo buttons of the toolbar do the same, for a delete, a duplicate and a turn into', async ({ page }) => {
    await start(page);
    await page.evaluate(() => ((window as any).ed.options = { toolbar: ['undo', 'redo'] }));
    await hover(page, 'h2');
    await handle(page).click();
    await item(page, 'Delete').click();
    expect(await html(page)).toBe('<p>first</p><p>third</p>');
    await page.locator('.aurebesh-cmd-undo').click();
    expect(await html(page)).toBe(START);
    await page.locator('.aurebesh-cmd-redo').click();
    expect(await html(page)).toBe('<p>first</p><p>third</p>');
    await page.locator('.aurebesh-cmd-undo').click();
    await hover(page, 'h2');
    await handle(page).click();
    await item(page, 'Heading 1').click();
    expect(await html(page)).toBe('<p>first</p><h1>second</h1><p>third</p>');
    await page.locator('.aurebesh-cmd-undo').click();
    expect(await html(page)).toBe(START);
  });

  test('replace all can be undone with the keyboard too', async ({ page }) => {
    await start(page, '<p>cat cat</p>');
    await content(page).click();
    await page.keyboard.press('Control+H');
    await page.locator('.aurebesh-find-input').first().fill('cat');
    await page.locator('.aurebesh-find-replace-input').fill('dog');
    await page.locator('.aurebesh-find-replace-all').click();
    expect(await html(page)).toBe('<p>dog dog</p>');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+Z');
    expect(await html(page)).toBe('<p>cat cat</p>');
  });
});
