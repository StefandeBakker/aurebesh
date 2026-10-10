import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { button, content, expect, html, open, setHtml } from './helpers';

const TABLE = '<table><tbody><tr><td>a1</td><td>b1</td><td>c1</td></tr><tr><td>a2</td><td>b2</td><td>c2</td></tr></tbody></table><p>after</p>';

const widths = (page: Page) =>
  page.evaluate(() => Array.from(document.querySelectorAll('.aurebesh-content table > colgroup > col')).map((c) => parseFloat((c as HTMLElement).style.width)));

/** Pixel position of the border to the right of column `i` (0-based), in the first row. */
const borderX = (page: Page, i: number) =>
  page.evaluate((n) => {
    const r = document.querySelectorAll('.aurebesh-content tr')[0].children[n].getBoundingClientRect();
    return { x: r.right, y: r.top + r.height / 2 };
  }, i);

async function drag(page: Page, i: number, dx: number): Promise<void> {
  const { x, y } = await borderX(page, i);
  await page.mouse.move(x - 1, y);
  await page.mouse.down();
  await page.mouse.move(x - 1 + dx / 2, y, { steps: 3 });
  await page.mouse.move(x - 1 + dx, y, { steps: 3 });
  await page.mouse.up();
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

test.describe('dragging column borders', () => {
  test('the pointer shows a resize cursor on a column border, and not inside a cell', async ({ page }) => {
    await open(page, TABLE);
    const { x, y } = await borderX(page, 0);
    await page.mouse.move(x - 1, y);
    await expect(content(page)).toHaveClass(/aurebesh-col-resize/);
    await page.mouse.move(x - 40, y);
    await expect(content(page)).not.toHaveClass(/aurebesh-col-resize/);
    const last = await borderX(page, 2); // the outer edge of the table is not a border
    await page.mouse.move(last.x - 1, last.y);
    await expect(content(page)).not.toHaveClass(/aurebesh-col-resize/);
  });

  test('dragging a border makes the column to its left wider and the one to its right narrower', async ({ page }) => {
    await open(page, TABLE);
    const before = await page.evaluate(() => Array.from(document.querySelectorAll('.aurebesh-content tr')[0].children).map((c) => c.getBoundingClientRect().width));
    await drag(page, 0, 60);
    const w = await widths(page);
    expect(w).toHaveLength(3);
    expect(Math.round(sum(w))).toBe(100);
    expect(w[0]).toBeGreaterThan(w[2]);
    const after = await page.evaluate(() => Array.from(document.querySelectorAll('.aurebesh-content tr')[0].children).map((c) => c.getBoundingClientRect().width));
    expect(after[0] - before[0]).toBeGreaterThan(50);
    expect(after[0] - before[0]).toBeLessThan(70);
    expect(Math.abs(after[2] - before[2])).toBeLessThan(2); // the third column did not move
  });

  test('the new widths are stored in the HTML and survive a reload', async ({ page }) => {
    await open(page, TABLE);
    await drag(page, 1, -40);
    const out = await html(page);
    expect(out).toMatch(/<colgroup><col style="width: [\d.]+%;?"><col style="width: [\d.]+%;?"><col style="width: [\d.]+%;?"><\/colgroup>/);
    const w = await widths(page);
    await setHtml(page, out);
    expect(await widths(page)).toEqual(w);
  });

  test('a column cannot be made narrower than a few percent', async ({ page }) => {
    await open(page, TABLE);
    await drag(page, 0, -2000);
    const w = await widths(page);
    expect(w[0]).toBeGreaterThanOrEqual(5);
    expect(Math.round(sum(w))).toBe(100);
  });

  test('a change event is emitted once, when the mouse is released', async ({ page }) => {
    await open(page, TABLE);
    await page.evaluate(() => {
      (window as any).changes = 0;
      (window as any).ed.addEventListener('change', () => (window as any).changes++);
    });
    await drag(page, 0, 50);
    expect(await page.evaluate(() => (window as any).changes)).toBe(1);
  });

  test('adding and deleting a column keep the widths adding up to 100%', async ({ page }) => {
    await open(page, TABLE);
    await drag(page, 0, 60);
    await content(page).locator('td', { hasText: /^a1/ }).click();
    await button(page, 'Insert column right').click();
    let w = await widths(page);
    expect(w).toHaveLength(4);
    expect(Math.round(sum(w))).toBe(100);
    await button(page, 'Delete column').click();
    w = await widths(page);
    expect(w).toHaveLength(3);
    expect(Math.round(sum(w))).toBe(100);
  });

  test('works next to a merged cell, using the columns it covers', async ({ page }) => {
    await open(page, '<table><tbody><tr><td colspan="2">wide</td><td>c1</td></tr><tr><td>a2</td><td>b2</td><td>c2</td></tr></tbody></table><p>x</p>');
    // the border between a2 and b2 is not a border of the wide cell, but dragging it from the second row works
    const { x, y } = await page.evaluate(() => {
      const r = document.querySelectorAll('.aurebesh-content tr')[1].children[0].getBoundingClientRect();
      return { x: r.right, y: r.top + r.height / 2 };
    });
    await page.mouse.move(x - 1, y);
    await page.mouse.down();
    await page.mouse.move(x + 29, y, { steps: 4 });
    await page.mouse.up();
    const w = await widths(page);
    expect(w).toHaveLength(3);
    expect(w[0]).toBeGreaterThan(w[1]);
  });

  test('a read-only editor does not resize', async ({ page }) => {
    await open(page, TABLE);
    await page.evaluate(() => (window as any).ed.setAttribute('readonly', ''));
    const { x, y } = await borderX(page, 0);
    await page.mouse.move(x - 1, y);
    await expect(content(page)).not.toHaveClass(/aurebesh-col-resize/);
    await page.mouse.down();
    await page.mouse.move(x + 60, y, { steps: 3 });
    await page.mouse.up();
    expect(await widths(page)).toEqual([]);
  });

  test('in a right-to-left table, dragging right makes the column on the right narrower', async ({ page }) => {
    await open(page, TABLE.replace('<table>', '<table dir="rtl">'));
    const before = await page.evaluate(() => Array.from(document.querySelectorAll('.aurebesh-content tr')[0].children).map((c) => c.getBoundingClientRect().width));
    // column 0 is the rightmost; the border to its left separates it from column 1
    const { x, y } = await page.evaluate(() => {
      const r = document.querySelectorAll('.aurebesh-content tr')[0].children[0].getBoundingClientRect();
      return { x: r.left, y: r.top + r.height / 2 };
    });
    await page.mouse.move(x + 1, y);
    await expect(content(page)).toHaveClass(/aurebesh-col-resize/);
    await page.mouse.down();
    await page.mouse.move(x + 41, y, { steps: 4 }); // right: column 0 gets narrower
    await page.mouse.up();
    const after = await page.evaluate(() => Array.from(document.querySelectorAll('.aurebesh-content tr')[0].children).map((c) => c.getBoundingClientRect().width));
    expect(before[0] - after[0]).toBeGreaterThan(30);
  });
});
