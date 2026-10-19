import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { button, content, expect, html, open, undo } from './helpers';

const PLAIN =
  '<table><tbody><tr><td>a1</td><td>b1</td><td>c1</td></tr><tr><td>a2</td><td>b2</td><td>c2</td></tr><tr><td>a3</td><td>b3</td><td>c3</td></tr></tbody></table><p>after</p>';

const cell = (page: Page, text: string) => content(page).locator('td', { hasText: new RegExp(`^${text}$`) });

/** A real drag with the mouse from one cell to another. */
async function mouseDrag(page: Page, from: string, to: string): Promise<void> {
  const a = (await cell(page, from).boundingBox())!;
  const b = (await cell(page, to).boundingBox())!;
  await page.mouse.move(a.x + a.width / 2 - 8, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2 + 20, (a.y + b.y) / 2 + 10, { steps: 5 });
  await page.mouse.move(b.x + b.width / 2 + 8, b.y + b.height / 2, { steps: 5 });
  await page.mouse.up();
}

const style = (page: Page, text: string) => cell(page, text).getAttribute('style');
const pick = async (page: Page, title: string, color: string) => {
  await page.locator(`.aurebesh-table-tools button[title="${title}"]`).click();
  await page.locator(`.aurebesh-table-tools .aurebesh-color-grid button[title="${color}"]:visible`).click();
};

test.describe('cell properties', () => {
  test('the text of a cell is aligned both ways, and the buttons show what the cell has', async ({ page }) => {
    await open(page, PLAIN);
    await cell(page, 'b2').click();
    await button(page, 'Align cell text right').click();
    await button(page, 'Align cell text to the bottom').click();
    expect(await style(page, 'b2')).toMatch(/text-align: right/);
    expect(await style(page, 'b2')).toMatch(/vertical-align: bottom/);
    await expect(button(page, 'Align cell text right')).toHaveAttribute('aria-pressed', 'true');
    await expect(button(page, 'Align cell text left')).toHaveAttribute('aria-pressed', 'false');
    await button(page, 'Align cell text right').click(); // a second click takes it away
    expect(await style(page, 'b2')).not.toMatch(/text-align/);
    expect(await html(page)).toMatch(/<td style="vertical-align: bottom;?">b2<\/td>/);
  });

  test('a background goes to every selected cell, stays selected for the next change, and is one step for undo', async ({ page }) => {
    await open(page, PLAIN);
    await mouseDrag(page, 'a1', 'b2');
    await pick(page, 'Cell background', '#fef08a');
    for (const t of ['a1', 'b1', 'a2', 'b2']) expect(await style(page, t), t).toMatch(/background-color: rgb\(254, 240, 138\)/);
    for (const t of ['c1', 'c2', 'a3']) expect(await style(page, t), t).toBeNull();

    await button(page, 'Center cell text').click(); // the same four cells
    for (const t of ['a1', 'b1', 'a2', 'b2']) expect(await style(page, t), t).toMatch(/text-align: center/);
    expect(await style(page, 'c1')).toBeNull();

    await undo(page);
    for (const t of ['a1', 'b2']) expect(await style(page, t), t).not.toMatch(/text-align/);
    for (const t of ['a1', 'b2']) expect(await style(page, t), t).toMatch(/background-color/); // only the last step is undone
  });

  test('a fill is taken away with "No fill"', async ({ page }) => {
    await open(page, PLAIN);
    await cell(page, 'c3').click();
    await pick(page, 'Cell background', '#bbf7d0');
    expect(await style(page, 'c3')).toMatch(/background-color/);
    await page.locator('.aurebesh-table-tools button[title="Cell background"]').click();
    await page.locator('.aurebesh-table-tools .aurebesh-color-reset:visible').click();
    expect(await style(page, 'c3')).toBeNull();
  });

  test('a border has a width and a colour, one without the other gives the missing part a default', async ({ page }) => {
    await open(page, PLAIN);
    await cell(page, 'b2').click();
    await page.locator('.aurebesh-cellborder').selectOption('2px');
    expect(await style(page, 'b2')).toMatch(/border: 2px solid rgb\(154, 163, 178\)/);
    await pick(page, 'Border color', '#d92d20');
    expect(await style(page, 'b2')).toMatch(/border: 2px solid rgb\(217, 45, 32\)/);
    await page.locator('.aurebesh-cellborder').selectOption('none');
    expect(await style(page, 'b2')).toMatch(/border: 0px solid transparent/);
    await expect(page.locator('.aurebesh-cellborder')).toHaveValue('none');
    await page.locator('.aurebesh-cellborder').selectOption('');
    expect(await style(page, 'b2')).toBeNull();
    // the colour first: a thin border
    await pick(page, 'Border color', '#3b82f6');
    expect(await style(page, 'b2')).toMatch(/border: 1px solid rgb\(59, 130, 246\)/);
  });

  test('the border select shows the width of the cell under the caret', async ({ page }) => {
    await open(page, PLAIN);
    await cell(page, 'a1').click();
    await page.locator('.aurebesh-cellborder').selectOption('4px');
    await cell(page, 'a2').click();
    await expect(page.locator('.aurebesh-cellborder')).toHaveValue('');
    await cell(page, 'a1').click();
    await expect(page.locator('.aurebesh-cellborder')).toHaveValue('4px');
  });

  test('a header row that is switched on and off keeps what its cells look like', async ({ page }) => {
    await open(page, PLAIN);
    await cell(page, 'a1').click();
    await button(page, 'Center cell text').click();
    await button(page, 'Toggle header row').click();
    expect(await html(page)).toMatch(/<th style="text-align: center;?">a1<\/th>/);
  });

  test('what is safe is kept in the output, and nothing else', async ({ page }) => {
    await open(page, '<table><tbody><tr><td style="background-color: #fef08a; position: fixed; border: 1px solid blue; vertical-align: top; text-align: justify; width: 90px">x</td></tr></tbody></table>');
    const out = await html(page);
    expect(out).not.toMatch(/position|width: 90px/);
    expect(out).toMatch(/background-color/);
    expect(out).toMatch(/vertical-align: top/);
  });
});

test.describe('a table caption', () => {
  test('is added above the table with the caret in it, and its text is part of the table', async ({ page }) => {
    await open(page, PLAIN);
    await cell(page, 'b2').click();
    await button(page, 'Table caption').click();
    await expect(content(page).locator('table > caption')).toHaveCount(1);
    expect(await content(page).evaluate((c) => c.querySelector('table')!.firstElementChild!.tagName)).toBe('CAPTION');
    await expect(button(page, 'Table caption')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.type('Sales per quarter');
    expect(await html(page)).toContain('<caption>Sales per quarter</caption>');
  });

  test('Enter or Tab in the caption goes on to the first cell, and the caption can be removed while the caret is in it', async ({ page }) => {
    await open(page, PLAIN);
    await cell(page, 'b2').click();
    await button(page, 'Table caption').click();
    await page.keyboard.type('Caption');
    await page.keyboard.press('Enter');
    await page.keyboard.type('X');
    expect(await html(page)).toContain('<caption>Caption</caption>'); // no line break in it
    expect(await html(page)).toContain('Xa1');
    await content(page).locator('caption').click();
    await expect(page.locator('.aurebesh-table-tools')).toBeVisible(); // the tools are there for the caption too
    await button(page, 'Table caption').click();
    await expect(content(page).locator('caption')).toHaveCount(0);
  });

  test('adding and removing a caption is one step for undo each', async ({ page }) => {
    await open(page, PLAIN);
    await cell(page, 'a1').click();
    await button(page, 'Table caption').click();
    await expect(content(page).locator('caption')).toHaveCount(1);
    await undo(page);
    await expect(content(page).locator('caption')).toHaveCount(0);
  });
});
