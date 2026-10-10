import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { button, content, expect, html, open } from './helpers';

const PLAIN =
  '<table><tbody><tr><td>a1</td><td>b1</td><td>c1</td></tr><tr><td>a2</td><td>b2</td><td>c2</td></tr><tr><td>a3</td><td>b3</td><td>c3</td></tr></tbody></table><p>after</p>';

const centre = async (page: Page, text: string) => {
  const box = (await content(page).locator('td', { hasText: new RegExp(`^${text}$`) }).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/** A real drag with the mouse from one cell to another. */
async function mouseDrag(page: Page, from: string, to: string): Promise<void> {
  const a = await centre(page, from);
  const b = await centre(page, to);
  await page.mouse.move(a.x - 8, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
  await page.mouse.move(b.x + 8, b.y, { steps: 5 });
  await page.mouse.up();
}

test.describe('selecting cells with the mouse', () => {
  test('the table tools stay visible while cells are selected, and Merge is on', async ({ page }) => {
    await open(page, PLAIN);
    await mouseDrag(page, 'a1', 'b2');
    await expect(page.locator('.aurebesh-table-tools')).toBeVisible();
    await expect(button(page, 'Merge cells')).toBeEnabled();
  });

  test('a drag across cells can be merged with the button', async ({ page }) => {
    await open(page, PLAIN);
    await mouseDrag(page, 'a1', 'b1');
    await button(page, 'Merge cells').click();
    expect(await html(page)).toContain('colspan="2"');
  });

  test('the table does not move while the mouse button is down, so a drag ends on the cell it was aimed at', async ({ page }) => {
    await open(page, PLAIN);
    const top = async () => (await content(page).locator('td', { hasText: /^b1$/ }).boundingBox())!.y;
    const before = await top();
    const a = await centre(page, 'a1');
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.waitForTimeout(100);
    expect(await top()).toBe(before);
    await page.mouse.up();
    await expect(page.locator('.aurebesh-table-tools')).toBeVisible(); // it shows once the button is released
  });

  test('selecting a whole row or column of cells keeps the tools too', async ({ page }) => {
    await open(page, PLAIN);
    await mouseDrag(page, 'a1', 'c3');
    await expect(page.locator('.aurebesh-table-tools')).toBeVisible();
  });

  test('also when the selection is set on the row or table itself, as browsers do for a cell selection', async ({ page }) => {
    await open(page, PLAIN);
    await page.evaluate(() => {
      const c = document.querySelector('.aurebesh-content') as HTMLElement;
      c.focus();
      const rows = c.querySelectorAll('tr');
      const r = document.createRange();
      r.setStart(rows[0], 0); // before the first cell
      r.setEnd(rows[1], 2); // after the second cell of the second row
      const s = getSelection()!;
      s.removeAllRanges();
      s.addRange(r);
    });
    await expect(page.locator('.aurebesh-table-tools')).toBeVisible();
    await expect(button(page, 'Merge cells')).toBeEnabled();
    await button(page, 'Merge cells').click();
    expect(await html(page)).toMatch(/colspan="2" rowspan="2"/);
  });
});
