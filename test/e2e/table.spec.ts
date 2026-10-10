import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { button, content, expect, open, undo } from './helpers';

async function insertTable(page: Page, rows: number, cols: number) {
  await content(page).click();
  await button(page, 'Table').click();
  await page.locator('.aurebesh-table-grid button').nth((rows - 1) * 8 + (cols - 1)).click();
}

const shape = (page: Page) =>
  page.evaluate(() => {
    const t = document.querySelector('.aurebesh-content table') as HTMLTableElement | null;
    return t ? Array.from(t.rows).map((r) => Array.from(r.cells).map((c) => `${c.tagName.toLowerCase()}:${c.textContent}`)) : null;
  });

test.describe('tables', () => {
  test('size picker inserts a table and Tab walks through the cells', async ({ page }) => {
    await open(page);
    await insertTable(page, 2, 3);
    await page.keyboard.type('a');
    for (const t of ['b', 'c', 'd']) {
      await page.keyboard.press('Tab');
      await page.keyboard.type(t);
    }
    expect(await shape(page)).toEqual([
      ['td:a', 'td:b', 'td:c'],
      ['td:d', 'td:', 'td:'],
    ]);
  });

  test('Tab in the last cell adds a row', async ({ page }) => {
    await open(page);
    await insertTable(page, 1, 2);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.type('new');
    expect(await shape(page)).toEqual([
      ['td:', 'td:'],
      ['td:new', 'td:'],
    ]);
  });

  test('header row can be switched on and off', async ({ page }) => {
    await open(page);
    await insertTable(page, 2, 2);
    await button(page, 'Toggle header row').click();
    expect((await shape(page))![0]).toEqual(['th:', 'th:']);
    await button(page, 'Toggle header row').click();
    expect((await shape(page))![0]).toEqual(['td:', 'td:']);
  });

  test('row and column tools', async ({ page }) => {
    await open(page);
    await insertTable(page, 2, 2);
    await button(page, 'Insert row below').click();
    await button(page, 'Insert column right').click();
    expect(await shape(page)).toHaveLength(3);
    expect((await shape(page))![0]).toHaveLength(3);
    await button(page, 'Delete row').click();
    await button(page, 'Delete column').click();
    expect(await shape(page)).toHaveLength(2);
    expect((await shape(page))![0]).toHaveLength(2);
  });

  test('adding a row can be undone with Ctrl+Z', async ({ page }) => {
    await open(page);
    await insertTable(page, 2, 2);
    await button(page, 'Insert row below').click();
    expect(await shape(page)).toHaveLength(3);
    await undo(page);
    expect(await shape(page)).toHaveLength(2);
  });

  test('deleting the table leaves an empty editor that still accepts typing', async ({ page }) => {
    await open(page);
    await insertTable(page, 2, 2);
    await button(page, 'Delete table').click();
    expect(await shape(page)).toBeNull();
    await page.keyboard.type('after');
    await expect(content(page)).toContainText('after');
  });
});
