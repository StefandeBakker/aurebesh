import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { content, expect, html, open, setHtml } from './helpers';

/** The HTML without what some browsers add: a line break at the end, and a span around the text. */
const plain = (s: string) => s.replace(/<\/?span>|<br>/g, '');
const bar = (page: Page) => page.locator('.aurebesh-toolbar:not(.aurebesh-quickbar)').first();
const split = (page: Page, label: string) => bar(page).locator('.aurebesh-split', { has: page.locator(`button[aria-label="${label}"]`) });
const heading = (page: Page) => bar(page).locator('.aurebesh-cmd-heading');
const option = (page: Page, text: string) => bar(page).locator('.aurebesh-heading-pop .aurebesh-heading-option', { hasText: text });

test.describe('one button where there were two', () => {
  test('underline, strikethrough, clear formatting and the lists are a button with an arrow', async ({ page }) => {
    await open(page);
    for (const label of ['Underline', 'Strikethrough', 'Clear formatting', 'Bullet list', 'Numbered list']) {
      const s = split(page, label);
      await expect(s, label).toHaveCount(1);
      await expect(s.locator(':scope > button, :scope > .aurebesh-table-picker > button')).toHaveCount(2); // the button and its arrow
      await expect(s.locator('button.aurebesh-split-arrow')).toHaveCount(1);
    }
  });

  test('the button does what it did, and the arrow opens the dropdown of its look', async ({ page }) => {
    await open(page);
    await content(page).click();
    await page.keyboard.type('word');
    await page.keyboard.press('Control+A');
    await split(page, 'Underline').locator('button').first().click();
    expect(plain(await html(page))).toContain('<u>word</u>');
    await split(page, 'Underline').locator('.aurebesh-split-arrow').click();
    const pop = split(page, 'Underline').locator('.aurebesh-strike-pop');
    await expect(pop).toBeVisible();
    await pop.locator('.aurebesh-strike-option').nth(3).click(); // double
    expect(plain(await html(page))).toContain('double');
  });

  test('the dropdown is an overlay at the left edge of the button, not a column that makes the toolbar wider', async ({ page }) => {
    await open(page);
    const before = await bar(page).boundingBox();
    const s = split(page, 'Underline');
    await s.locator('.aurebesh-split-arrow').click();
    const pop = s.locator('.aurebesh-strike-pop');
    await expect(pop).toBeVisible();
    const after = await bar(page).boundingBox();
    expect(Math.round(after!.height)).toBe(Math.round(before!.height));
    const b = await s.boundingBox();
    const p = await pop.boundingBox();
    expect(Math.abs(p!.x - b!.x)).toBeLessThan(2);
  });
});

test.describe('the headings in one dropdown', () => {
  test('H1 to H6 are one button; a level makes the paragraph one, normal text takes it away again', async ({ page }) => {
    await open(page);
    await expect(bar(page).locator('.aurebesh-cmd-h1')).toHaveCount(0);
    await content(page).click();
    await page.keyboard.type('Title');
    await heading(page).click();
    await expect(bar(page).locator('.aurebesh-heading-pop .aurebesh-heading-option')).toHaveCount(7); // normal text and six levels
    await option(page, 'Heading 5').click();
    expect(plain(await html(page))).toBe('<h5>Title</h5>');
    await heading(page).click();
    await expect(option(page, 'Heading 5')).toHaveAttribute('aria-pressed', 'true');
    await option(page, 'Heading 2').click();
    expect(plain(await html(page))).toBe('<h2>Title</h2>');
    await heading(page).click();
    await option(page, 'Normal text').click();
    expect(plain(await html(page))).toBe('<p>Title</p>');
  });

  test('Mod+Alt+4 to 6 and the # shortcuts make the deeper levels too', async ({ page }) => {
    await open(page);
    await content(page).click();
    await page.keyboard.type('#### four');
    expect(plain(await html(page))).toBe('<h4>four</h4>');
    await setHtml(page, '<p>x</p>');
    await content(page).click();
    await page.keyboard.press('Control+Alt+6');
    expect(plain(await html(page))).toBe('<h6>x</h6>');
  });
});

test.describe('the looks of a list', () => {
  test('the arrow of the bullet list gives a disc, a circle or a square', async ({ page }) => {
    await open(page);
    await content(page).click();
    await page.keyboard.type('one');
    await split(page, 'Bullet list').locator('.aurebesh-split-arrow').click();
    await bar(page).locator('.aurebesh-list-option[aria-label="Square"]').click();
    expect(plain(await html(page))).toBe('<ul style="list-style-type: square;"><li>one</li></ul>');
  });

  test('the arrow of the numbered list gives letters or Roman numerals, and the plain numbers take the style away again', async ({ page }) => {
    await open(page);
    await content(page).click();
    await page.keyboard.type('one');
    const arrow = split(page, 'Numbered list').locator('.aurebesh-split-arrow');
    await arrow.click();
    await bar(page).locator('.aurebesh-list-option[aria-label="i. ii. iii."]').click();
    expect(plain(await html(page))).toContain('list-style-type: lower-roman');
    await arrow.click();
    await expect(bar(page).locator('.aurebesh-list-option[aria-label="i. ii. iii."]')).toHaveAttribute('aria-pressed', 'true');
    await bar(page).locator('.aurebesh-list-option[aria-label="1. 2. 3."]').click();
    expect(plain(await html(page))).toBe('<ol><li>one</li></ol>');
  });

  test('a style on a text that is no list yet makes it a list, and a list of the other kind turns into this one', async ({ page }) => {
    await open(page);
    await setHtml(page, '<ul><li>a</li><li>b</li></ul>');
    await content(page).locator('li').first().click();
    await split(page, 'Numbered list').locator('.aurebesh-split-arrow').click();
    await bar(page).locator('.aurebesh-list-option[aria-label="A. B. C."]').click();
    const out = await html(page);
    expect(out).toContain('<ol');
    expect(out).toContain('upper-alpha');
  });

  test('is one step of the history: undo takes the look away', async ({ page }) => {
    await open(page);
    await setHtml(page, '<ul><li>a</li></ul>');
    await content(page).locator('li').click();
    await split(page, 'Bullet list').locator('.aurebesh-split-arrow').click();
    await bar(page).locator('.aurebesh-list-option[aria-label="Circle"]').click();
    expect(plain(await html(page))).toContain('circle');
    await page.evaluate(() => (window as any).ed.instance.undo());
    expect(plain(await html(page))).not.toContain('circle');
  });
});
