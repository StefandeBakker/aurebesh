import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { content, expect, open } from './helpers';

// A phone: a narrow window and a finger.
test.use({ viewport: { width: 390, height: 780 }, hasTouch: true });

const html = (page: Page): Promise<string> => page.evaluate(() => (window as any).ed.instance.getHTML());
const handle = (page: Page) => page.locator('.aurebesh-blockhandle');
const menu = (page: Page) => page.locator('.aurebesh-blockmenu');
const noHover = (page: Page) => page.evaluate(() => matchMedia('(hover: none)').matches);

test.describe('a narrow screen', () => {
  test('the toolbar is one row that scrolls sideways, and the page does not', async ({ page }) => {
    await open(page, '<p>text</p>');
    const box = await page.locator('.aurebesh-toolbar:not(.aurebesh-quickbar)').first().boundingBox();
    expect(box!.height).toBeLessThan(80);
    const scrolls = await page.locator('.aurebesh-toolbar:not(.aurebesh-quickbar)').first().evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(scrolls).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('a dropdown of the toolbar is not cut off by it: it is whole in the window, under its button', async ({ page }) => {
    await open(page, '<p>text</p>');
    const button = page.locator('.aurebesh-swatch-color').first();
    await button.scrollIntoViewIfNeeded();
    await button.tap();
    const pop = page.locator('.aurebesh-table-pop:not([hidden])').first();
    await expect(pop).toBeVisible();
    const box = (await pop.boundingBox())!;
    const at = (await button.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y).toBeGreaterThanOrEqual(at.y + at.height);
    // nothing covers it: the point in its middle is a part of it
    const top = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.aurebesh-table-pop'), [box.x + box.width / 2, box.y + box.height / 2]);
    expect(top).toBe(true);
    // a swatch can be tapped
    await pop.locator('.aurebesh-color-grid button').nth(12).tap();
    await expect(pop).toBeHidden();
  });

  test('a dropdown closes when the toolbar is scrolled', async ({ page }) => {
    await open(page, '<p>text</p>');
    const button = page.locator('.aurebesh-swatch-color').first();
    await button.scrollIntoViewIfNeeded();
    await button.tap();
    await expect(page.locator('.aurebesh-table-pop:not([hidden])').first()).toBeVisible();
    await page.locator('.aurebesh-toolbar:not(.aurebesh-quickbar)').first().evaluate((el) => el.scrollBy(120, 0));
    await expect(page.locator('.aurebesh-table-pop:not([hidden])')).toHaveCount(0);
  });

  test('the find bar stays in the window: its buttons go to a next line', async ({ page }) => {
    await open(page, '<p>text</p>');
    await page.evaluate(() => (window as any).ed.instance.openFind());
    const buttons = page.locator('.aurebesh-find button:visible');
    await expect(buttons.first()).toBeVisible();
    for (const box of await buttons.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().right))) expect(box).toBeLessThanOrEqual(390);
  });
});

test.describe('the handle of a block on a touch screen', () => {
  const START = '<p>first</p><h2>second</h2><p>third</p>';

  test('is beside the block with the caret, and goes along when the caret goes to another block', async ({ page }) => {
    await open(page, START);
    test.skip(!(await noHover(page)), 'this browser cannot tell that it has no hover');
    await expect(handle(page)).toBeHidden();
    await content(page).locator('p').first().tap();
    await expect(handle(page)).toBeVisible();
    const first = (await handle(page).boundingBox())!;
    await content(page).locator('h2').tap();
    await expect.poll(async () => (await handle(page).boundingBox())!.y).toBeGreaterThan(first.y);
    // typing keeps it
    await page.keyboard.type('x');
    await expect(handle(page)).toBeVisible();
  });

  test('a tap on it opens the menu: a block is moved down, and the handle stays with the block', async ({ page }) => {
    await open(page, START);
    test.skip(!(await noHover(page)), 'this browser cannot tell that it has no hover');
    await content(page).locator('p').first().tap();
    await handle(page).tap();
    await expect(menu(page)).toBeVisible();
    const box = (await menu(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await menu(page).getByRole('menuitem', { name: /down|omlaag/i }).tap();
    await expect(menu(page)).toBeHidden();
    expect(await html(page)).toBe('<h2>second</h2><p>first</p><p>third</p>');
  });

  test('is not there when the caret is not in the text', async ({ page }) => {
    await open(page, START);
    test.skip(!(await noHover(page)), 'this browser cannot tell that it has no hover');
    await content(page).locator('p').first().tap();
    await expect(handle(page)).toBeVisible();
    await page.evaluate(() => {
      (document.activeElement as HTMLElement).blur();
      getSelection()!.removeAllRanges();
    });
    await expect(handle(page)).toBeHidden();
  });
});
