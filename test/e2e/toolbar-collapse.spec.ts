import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { content, expect, open } from './helpers';

const rowsOf = (page: Page) =>
  page.evaluate(() => {
    const tops = Array.from(document.querySelectorAll('.aurebesh-toolbar:not(.aurebesh-quickbar) > .aurebesh-group')).map((g) => (g as HTMLElement).offsetTop);
    return new Set(tops).size;
  });
const folded = (page: Page) => page.locator('.aurebesh-toolbar .aurebesh-group-collapsed');
/** Gives the editor a width of its own (0: the width of the page again). */
const narrowTo = (page: Page, px: number) =>
  page.evaluate((w) => {
    const ed = (window as any).ed as HTMLElement;
    ed.style.display = 'block';
    ed.style.width = w ? w + 'px' : '';
  }, px);
const toggles = (page: Page) => page.locator('.aurebesh-group-toggle');

const start = async (page: Page, width: number, options: Record<string, unknown> = {}) => {
  await page.setViewportSize({ width, height: 800 });
  await open(page);
  if (Object.keys(options).length) await page.evaluate((o) => ((window as any).ed.options = o), options);
  await content(page).waitFor();
};

test.describe('a toolbar that does not fit', () => {
  test('is on one row: groups fold into a button, in the order of the options, each keeping its place', async ({ page }) => {
    await start(page, 760, { toolbar: ['#Text', 'bold', 'italic', '|', '#Lists', 'ul', 'ol', '|', '#Insert', 'link', 'image', 'table', '|', '#Code', 'code', 'codeblock'] });
    await narrowTo(page, 420);
    await expect(folded(page).first()).toBeVisible();
    expect(await rowsOf(page)).toBe(1);
    // the last group goes first, and the groups are still in the order they were in
    const names = await page.locator('.aurebesh-toolbar:not(.aurebesh-quickbar) > .aurebesh-group').evaluateAll((gs) => gs.map((g) => g.getAttribute('aria-label')));
    expect(names).toEqual(['Text', 'Lists', 'Insert', 'Code']);
    await expect(page.locator('.aurebesh-group[aria-label="Code"]')).toHaveClass(/aurebesh-group-collapsed/);
  });

  test('opens what is in a folded group in a dropdown, and a button there works', async ({ page }) => {
    await start(page, 760, { toolbar: ['#Text', 'bold', 'italic', 'underline', 'strike', '|', '#Code', 'code', 'codeblock'] });
    await narrowTo(page, 190);
    await expect(folded(page).first()).toBeVisible();
    const code = page.locator('.aurebesh-group[aria-label="Code"]');
    await expect(code.locator('.aurebesh-group-pop')).toBeHidden();
    await code.locator('.aurebesh-group-toggle').click();
    await expect(code.locator('.aurebesh-group-pop')).toBeVisible();
    await content(page).evaluate((el) => (el.innerHTML = '<p>word</p>'));
    await content(page).click();
    await page.keyboard.press('Control+A');
    await code.locator('.aurebesh-group-toggle').click();
    await code.locator('.aurebesh-cmd-codeblock').click();
    await expect(content(page).locator('pre')).toHaveCount(1);
    await page.keyboard.press('Escape');
  });

  test('closes the dropdown on Escape and on a click outside', async ({ page }) => {
    await start(page, 760, { toolbar: ['#Text', 'bold', 'italic', 'underline', 'strike', '|', '#Code', 'code', 'codeblock'] });
    await narrowTo(page, 190);
    const toggle = toggles(page).first();
    await toggle.click();
    await expect(page.locator('.aurebesh-group-pop:visible')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('.aurebesh-group-pop:visible')).toHaveCount(0);
    await toggle.click();
    await page.mouse.click(700, 780); // outside the editor: the dropdown lies over the text
    await expect(page.locator('.aurebesh-group-pop:visible')).toHaveCount(0);
  });

  test('`collapse` says which groups go first, by the name of the group or of an item in it', async ({ page }) => {
    await start(page, 760, { toolbar: ['#Text', 'bold', 'italic', '|', '#Lists', 'ul', 'ol', '|', '#Insert', 'link', 'image', 'table', '|', '#Code', 'code', 'codeblock'], collapse: ['Text', 'ul'] });
    await narrowTo(page, 330);
    await expect(folded(page).first()).toBeVisible();
    await expect(page.locator('.aurebesh-group[aria-label="Text"]')).toHaveClass(/aurebesh-group-collapsed/);
    // the next one is the group with `ul` in it; the groups that were not named do not go before those that were
    const first = await folded(page).first().getAttribute('aria-label');
    expect(first).toBe('Text');
  });

  test('widening it unfolds the groups again', async ({ page }) => {
    await start(page, 760, { toolbar: ['#Text', 'bold', 'italic', '|', '#Insert', 'link', 'image', 'table', '|', '#Code', 'code', 'codeblock'] });
    await narrowTo(page, 260);
    await expect(folded(page).first()).toBeVisible();
    await narrowTo(page, 0);
    await expect(folded(page)).toHaveCount(0);
    expect(await rowsOf(page)).toBe(1);
  });

  test('`collapse: false` leaves the toolbar to wrap', async ({ page }) => {
    await start(page, 760, { toolbar: ['#Text', 'bold', 'italic', '|', '#Insert', 'link', 'image', 'table', '|', '#Code', 'code', 'codeblock'], collapse: false });
    await narrowTo(page, 260);
    await expect(folded(page)).toHaveCount(0);
    expect(await rowsOf(page)).toBeGreaterThan(1);
  });

  test('a toolbar that fits has nothing folded, and the default toolbar is not on more rows', async ({ page }) => {
    await start(page, 1280);
    await expect(folded(page)).toHaveCount(0);
    await page.setViewportSize({ width: 900, height: 800 });
    await expect(async () => expect(await rowsOf(page)).toBe(1)).toPass();
  });
});

test.describe('the dropdown of a folded group', () => {
  test('is an overlay: opening it changes nothing in the toolbar, and what was in rows is in one line', async ({ page }) => {
    await start(page, 760, { toolbar: ['#Text', 'bold', 'italic', '|', '#Align', 'alignLeft', 'alignCenter', 'alignRight', '/', 'indent', 'outdent', '|', '#Code', 'code', 'codeblock'] });
    await narrowTo(page, 200);
    const align = page.locator('.aurebesh-group[aria-label="Align"]');
    await expect(align).toHaveClass(/aurebesh-group-collapsed/);
    const measure = () =>
      page.evaluate(() => {
        const bar = document.querySelector('.aurebesh-toolbar:not(.aurebesh-quickbar)') as HTMLElement;
        return { bar: Math.round(bar.getBoundingClientRect().height), groups: Array.from(bar.children).map((g) => Math.round((g as HTMLElement).getBoundingClientRect().width)) };
      });
    const before = await measure();
    await align.locator('.aurebesh-group-toggle').click();
    const pop = align.locator('.aurebesh-group-pop');
    await expect(pop).toBeVisible();
    expect(await measure()).toEqual(before);
    const tops = await pop.locator('button').evaluateAll((bs) => new Set(bs.map((b) => Math.round(b.getBoundingClientRect().top))).size);
    expect(tops).toBe(1);
    await expect(pop.locator('button')).toHaveCount(5);
  });
});
