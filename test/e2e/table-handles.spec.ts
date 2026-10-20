import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { button, content, expect, html, open, undo } from './helpers';

const TABLE = '<table><tbody><tr><th>h1</th><th>h2</th><th>h3</th></tr><tr><td>a2</td><td>b2</td><td>c2</td></tr><tr><td>a3</td><td>b3</td><td>c3</td></tr><tr><td>a4</td><td>b4</td><td>c4</td></tr></tbody></table><p>z</p>';
const MERGED = '<table><tbody><tr><td rowspan="2">a1</td><td>b1</td></tr><tr><td>b2</td></tr><tr><td>a3</td><td>b3</td></tr></tbody></table><p>z</p>';

const cell = (page: Page, text: string) => content(page).locator('td,th', { hasText: new RegExp(`^${text}$`) });
const texts = (page: Page) => content(page).evaluate((c) => Array.from(c.querySelectorAll('tr')).map((tr) => Array.from(tr.cells).map((x) => x.textContent).join('|')));
const centre = async (locator: ReturnType<Page['locator']>) => {
  const b = (await locator.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
/** A point on a border handle that is clear of the handles that cross it: near the start of a column border, and near the left of a row border. */
const grab = async (locator: ReturnType<Page['locator']>, along: 'col' | 'row') => {
  const b = (await locator.boundingBox())!;
  return along === 'col' ? { x: b.x + b.width / 2, y: b.y + 8 } : { x: b.x + 24, y: b.y + b.height / 2 };
};
const drag = async (page: Page, from: { x: number; y: number }, to: { x: number; y: number }) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
};
const widths = (page: Page) => content(page).evaluate((c) => Array.from(c.querySelectorAll('col')).map((x) => parseFloat((x as HTMLElement).style.width)));

test.describe('handles on a table', () => {
  test('are there for the table with the caret, and not for a text outside it, nor in a read-only editor', async ({ page }) => {
    await open(page, TABLE);
    await expect(page.locator('.aurebesh-handle')).toHaveCount(0);
    await cell(page, 'b2').click();
    await expect(page.locator('.aurebesh-handle-col')).toHaveCount(2);
    await expect(page.locator('.aurebesh-handle-row')).toHaveCount(4);
    await expect(page.locator('.aurebesh-handle-col-grip')).toHaveCount(3);
    await expect(page.locator('.aurebesh-handle-row-grip')).toHaveCount(4);
    await content(page).locator('p').last().click();
    await expect(page.locator('.aurebesh-handle')).toHaveCount(0);
    await cell(page, 'b2').click();
    await expect(page.locator('.aurebesh-handle')).not.toHaveCount(0);
    await page.evaluate(() => (window as any).ed.instance.setReadOnly(true));
    await expect(page.locator('.aurebesh-handle')).toHaveCount(0);
  });

  test('are not part of the text', async ({ page }) => {
    await open(page, TABLE);
    await cell(page, 'b2').click();
    await expect(page.locator('.aurebesh-handle')).not.toHaveCount(0);
    expect(await html(page)).not.toMatch(/handle|aurebesh-/);
    expect(await content(page).locator('.aurebesh-handle').count()).toBe(0);
  });

  test('do not lie across a cell that is merged over the border: there is no border there', async ({ page }) => {
    await open(page, MERGED);
    await cell(page, 'b1').click();
    // between a1|b1 and a1|b2 there is a border; between a3|b3 too: one column border in two stretches
    await expect(page.locator('.aurebesh-handle-col')).toHaveCount(1); // one border, all the way down: a1 is a tall cell beside b1 and b2
    // the row border under row 1 does not cross a1, which reaches down to row 2: only b1's part is a border
    const rows = page.locator('.aurebesh-handle-row');
    const widthsOfRowBorders = await rows.evaluateAll((els) => els.map((e) => Math.round((e as HTMLElement).getBoundingClientRect().width)));
    const a1 = Math.round((await cell(page, 'a1').boundingBox())!.width);
    const b1 = Math.round((await cell(page, 'b1').boundingBox())!.width);
    expect(widthsOfRowBorders.some((w) => Math.abs(w - b1) <= 2)).toBe(true);
    expect(widthsOfRowBorders.every((w) => w < a1 + b1 - 2 || w === widthsOfRowBorders[widthsOfRowBorders.length - 1])).toBe(true);
  });
});

test.describe('resizing', () => {
  test('a column border dragged with the mouse changes the widths of the two columns around it', async ({ page }) => {
    await open(page, TABLE);
    await cell(page, 'b2').click();
    const handle = page.locator('.aurebesh-handle-col').first();
    const from = await grab(handle, 'col');
    await drag(page, from, { x: from.x + 80, y: from.y });
    const [w1, w2, w3] = await widths(page);
    expect(w1).toBeGreaterThan(38);
    expect(w2).toBeLessThan(30);
    expect(Math.round(w1 + w2 + w3)).toBe(100);
  });

  test('a row border dragged makes the row taller, never lower than a minimum, and the height is kept in the output', async ({ page }) => {
    await open(page, TABLE);
    await cell(page, 'b2').click();
    const before = (await cell(page, 'b3').boundingBox())!.height;
    const handle = page.locator('.aurebesh-handle-row').nth(2); // under row 3
    const from = await grab(handle, 'row');
    await drag(page, from, { x: from.x, y: from.y + 60 });
    const after = (await cell(page, 'b3').boundingBox())!.height;
    expect(after).toBeGreaterThan(before + 40);
    expect(await html(page)).toMatch(/<tr style="height: \d+px;?">\s*<td>a3<\/td>/);
    await page.locator('.aurebesh-handle-row').nth(2).hover();
    const again = await grab(page.locator('.aurebesh-handle-row').nth(2), 'row');
    await drag(page, again, { x: again.x, y: again.y - 400 }); // far up: the minimum
    expect((await cell(page, 'b3').boundingBox())!.height).toBeGreaterThanOrEqual(24);
  });

  test('works with a finger: the same events with the pointer type touch', async ({ page }) => {
    await open(page, TABLE);
    await cell(page, 'b2').click();
    const handle = page.locator('.aurebesh-handle-col').first();
    const from = await grab(handle, 'col');
    await page.evaluate(
      ({ x, y }) => {
        const el = document.elementFromPoint(x, y) as HTMLElement;
        const fire = (type: string, dx: number) => el.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x + dx, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: 1 }));
        fire('pointerdown', 0);
        fire('pointermove', 30);
        fire('pointermove', 60);
        fire('pointerup', 60);
      },
      from,
    );
    const [w1, w2] = await widths(page);
    expect(w1).toBeGreaterThan(w2 + 5);
  });
});

test.describe('moving rows and columns by their grips', () => {
  test('a row dragged by its grip goes to the place it is dropped on, and is one step for undo', async ({ page }) => {
    await open(page, TABLE);
    await cell(page, 'b2').click();
    const grip = await centre(page.locator('.aurebesh-handle-row-grip').nth(1)); // row 2
    const target = await centre(cell(page, 'b4'));
    await drag(page, grip, { x: grip.x + 20, y: target.y + 5 });
    expect(await texts(page)).toEqual(['h1|h2|h3', 'a3|b3|c3', 'a4|b4|c4', 'a2|b2|c2']);
    await undo(page);
    expect(await texts(page)).toEqual(['h1|h2|h3', 'a2|b2|c2', 'a3|b3|c3', 'a4|b4|c4']);
  });

  test('a row dragged up goes in front of the row it is dropped on', async ({ page }) => {
    await open(page, TABLE);
    await cell(page, 'b4').click();
    const grip = await centre(page.locator('.aurebesh-handle-row-grip').nth(3));
    const target = await centre(cell(page, 'b2'));
    await drag(page, grip, { x: grip.x, y: target.y - 4 });
    expect(await texts(page)).toEqual(['h1|h2|h3', 'a4|b4|c4', 'a2|b2|c2', 'a3|b3|c3']);
  });

  test('a column dragged by its grip moves with its cells, header and width', async ({ page }) => {
    await open(page, TABLE);
    await cell(page, 'b2').click();
    const handle = page.locator('.aurebesh-handle-col').first();
    const from = await grab(handle, 'col');
    await drag(page, from, { x: from.x + 60, y: from.y }); // column one wider: it has a width of its own now
    await cell(page, 'b2').click();
    const [w1] = await widths(page);
    const grip = await centre(page.locator('.aurebesh-handle-col-grip').nth(0));
    const target = await centre(cell(page, 'c3'));
    await drag(page, grip, { x: target.x + 10, y: grip.y + 4 });
    expect(await texts(page)).toEqual(['h2|h3|h1', 'b2|c2|a2', 'b3|c3|a3', 'b4|c4|a4']);
    expect((await widths(page))[2]).toBeCloseTo(w1, 0);
  });

  test('a tap on a grip selects the row or the column, with a frame on every cell', async ({ page }) => {
    await open(page, TABLE);
    await cell(page, 'b2').click();
    const grip = await centre(page.locator('.aurebesh-handle-row-grip').nth(2));
    await page.mouse.click(grip.x, grip.y);
    await expect(page.locator('.aurebesh-cell-sel')).toHaveCount(3);
    await button(page, 'Copy row').click();
    await cell(page, 'a4').click();
    await button(page, 'Paste row below').click();
    expect((await texts(page)).slice(-1)).toEqual(['a3|b3|c3']);
    await cell(page, 'a2').click();
    const col = await centre(page.locator('.aurebesh-handle-col-grip').nth(1));
    await page.mouse.click(col.x, col.y);
    await expect(page.locator('.aurebesh-cell-sel')).toHaveCount(5);
  });

  test('a tap with a finger selects too', async ({ browser }) => {
    const context = await browser.newContext({ hasTouch: true, baseURL: 'http://localhost:5199' });
    const page = await context.newPage();
    await open(page, TABLE);
    await cell(page, 'b2').click();
    const grip = await centre(page.locator('.aurebesh-handle-row-grip').nth(1));
    await page.touchscreen.tap(grip.x, grip.y);
    await expect(page.locator('.aurebesh-cell-sel')).toHaveCount(3);
    await context.close();
  });

  test('a row cannot go past a cell that is merged over several rows: it stays, and says why', async ({ page }) => {
    await open(page, MERGED);
    await cell(page, 'b1').click();
    await expect(page.locator('.aurebesh-handle-row-grip').nth(0)).toBeVisible(); // the grips show a moment after the click
    const grip = await centre(page.locator('.aurebesh-handle-row-grip').nth(0));
    const target = await centre(cell(page, 'b3'));
    await drag(page, grip, { x: grip.x, y: target.y + 5 });
    expect(await texts(page)).toEqual(['a1|b1', 'b2', 'a3|b3']);
    await expect(page.locator('.aurebesh-status')).toContainText('cannot move');
  });

  test('the selected cells have a frame, and Merge works on those', async ({ page }) => {
    await open(page, TABLE);
    const a = await centre(cell(page, 'a2'));
    const b = await centre(cell(page, 'b3'));
    await drag(page, { x: a.x - 6, y: a.y }, { x: b.x + 6, y: b.y });
    await expect(page.locator('.aurebesh-cell-sel')).toHaveCount(4);
    await button(page, 'Merge cells').click();
    expect(await content(page).locator('td[colspan="2"][rowspan="2"]').count()).toBe(1);
    await expect(page.locator('.aurebesh-cell-sel')).toHaveCount(0); // a single cell now
  });
});

test.describe('moving with buttons', () => {
  test('a row or a column moves a step, and the button is off where it cannot', async ({ page }) => {
    await open(page, TABLE);
    await cell(page, 'a2').click();
    await expect(button(page, 'Move column left')).toBeDisabled();
    await button(page, 'Move row down').click();
    expect(await texts(page)).toEqual(['h1|h2|h3', 'a3|b3|c3', 'a2|b2|c2', 'a4|b4|c4']);
    await button(page, 'Move column right').click();
    expect(await texts(page)).toEqual(['h2|h1|h3', 'b3|a3|c3', 'b2|a2|c2', 'b4|a4|c4']);
    await cell(page, 'c4').click();
    await expect(button(page, 'Move column right')).toBeDisabled();
    await expect(button(page, 'Move row down')).toBeDisabled();
    await button(page, 'Move row up').click();
    expect(await texts(page)).toEqual(['h2|h1|h3', 'b3|a3|c3', 'b4|a4|c4', 'b2|a2|c2']);
    await cell(page, 'c4').click(); // after moving a row the whole row is selected: pick a cell in the third column again
    await button(page, 'Move column left').click();
    expect(await texts(page)).toEqual(['h2|h3|h1', 'b3|c3|a3', 'b4|c4|a4', 'b2|c2|a2']);
  });

  test('a merged cell in between stops the move, in both directions', async ({ page }) => {
    await open(page, MERGED);
    await cell(page, 'b3').click();
    await expect(button(page, 'Move row up')).toBeDisabled();
    await cell(page, 'b1').click();
    await expect(button(page, 'Move row down')).toBeDisabled();
  });
});
