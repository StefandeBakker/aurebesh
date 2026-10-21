import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { content, expect, open, undo } from './helpers';

/** The HTML as it is given out: clean, without what a browser adds while editing. */
const html = (page: Page): Promise<string> => page.evaluate(() => (window as any).ed.instance.getHTML());

const start = async (page: Page, initial = '<p>one</p><p>two</p>') => {
  await open(page, initial);
  await page.evaluate(() => ((window as any).ed.options = { toolbar: ['bold', 'link', 'blocks'] }));
  await page.locator('.aurebesh-cmd-blocks').click();
  await expect(page.locator('.aurebesh-panel')).toBeVisible();
};
const block = (page: Page, id: string) => page.locator(`.aurebesh-block[data-block="${id}"]`);
const rows = (page: Page) => content(page).locator('[data-layout="row"]');
const cols = (page: Page) => content(page).locator('[data-layout="col"]');

test.describe('the building blocks panel', () => {
  test('is a panel of the sidebar with the layouts and the content, as buttons that can be dragged', async ({ page }) => {
    await start(page);
    await expect(page.locator('.aurebesh-panel-head strong')).toHaveText('Blocks');
    await expect(page.locator('.aurebesh-block[data-block^="row"]')).toHaveCount(6);
    for (const id of ['heading', 'text', 'image', 'button', 'divider']) await expect(block(page, id)).toBeVisible();
    await expect(block(page, 'row2')).toHaveAttribute('draggable', 'true');
    await expect(block(page, 'row2')).toHaveAccessibleName('2 columns');
    await expect(page.locator('.aurebesh-cmd-blocks')).toHaveAttribute('aria-expanded', 'true');
  });
});

test.describe('adding with a click', () => {
  test('a layout goes after the paragraph that has the caret, and the caret goes into its first column', async ({ page }) => {
    await start(page);
    await content(page).locator('p').first().click();
    await block(page, 'row2').click();
    await expect(rows(page)).toHaveCount(1);
    await expect(cols(page)).toHaveCount(2);
    const order = await content(page).evaluate((c) => Array.from(c.children).map((x) => x.tagName + (x.getAttribute('data-layout') ?? '') + ':' + (x.textContent ?? '')));
    expect(order).toEqual(['P:one', 'DIVrow:', 'P:two']);
    expect(await rows(page).evaluate((r) => (r as HTMLElement).style.gridTemplateColumns)).toBe('1fr 1fr');
    await page.keyboard.type('left');
    await expect(cols(page).first()).toHaveText('left');
    await expect(cols(page).last()).toHaveText('');
  });

  test('a click on an empty line puts the block in the place of the line', async ({ page }) => {
    await start(page, '<p>one</p><p><br></p><p>two</p>');
    await content(page).locator('p').nth(1).click();
    await block(page, 'divider').click();
    expect(await html(page)).toMatch(/<p>one<\/p><hr><p>two<\/p>/);
  });

  test('a heading is added with its text selected, so that typing replaces it', async ({ page }) => {
    await start(page);
    await content(page).locator('p').last().click();
    await block(page, 'heading').click();
    await expect(content(page).locator('h2')).toHaveText('Your heading');
    await page.keyboard.type('My title');
    await expect(content(page).locator('h2')).toHaveText('My title');
  });

  test('a button is a link that looks like one, and keeps its look in the output', async ({ page }) => {
    await start(page);
    await content(page).locator('p').first().click();
    await block(page, 'button').click();
    const out = await html(page);
    expect(out).toMatch(/<a href="https:\/\/example.com" data-button="" style="display: inline-block; padding: 10px 20px; background-color: (?:#2563eb|rgb\(37, 99, 235\))/);
    await content(page).locator('a[data-button]').click();
    await expect(page.locator('.aurebesh-link-tools')).toBeVisible(); // the address can be changed like that of any link
  });

  test('the block is one step for undo', async ({ page }) => {
    await start(page);
    await content(page).locator('p').first().click();
    await block(page, 'row3').click();
    await expect(cols(page)).toHaveCount(3);
    await undo(page);
    await expect(rows(page)).toHaveCount(0);
    expect(await html(page)).toBe('<p>one</p><p>two</p>');
  });

  test('an image asks for a file and goes where the caret was', async ({ page }) => {
    await start(page);
    await content(page).locator('p').first().click();
    const chooser = page.waitForEvent('filechooser');
    await block(page, 'image').click();
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    await (await chooser).setFiles({ name: 'a.png', mimeType: 'image/png', buffer: png });
    await expect(content(page).locator('img')).toHaveCount(1);
  });

  test('nothing is added when the editor is read-only', async ({ page }) => {
    await start(page);
    await page.evaluate(() => (window as any).ed.instance.setReadOnly(true));
    await block(page, 'row2').click();
    await expect(rows(page)).toHaveCount(0);
  });
});

test.describe('dragging into the text', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'Playwright cannot drive HTML5 drag and drop in WebKit (it is covered in Chromium and Firefox)');
  test('a layout dropped between two paragraphs goes between them, with a line that showed where', async ({ page }) => {
    await start(page);
    const second = (await content(page).locator('p').nth(1).boundingBox())!;
    const from = (await block(page, 'row2').boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(second.x + 60, second.y + 3, { steps: 6 }); // the upper half of the second paragraph
    await expect(page.locator('.aurebesh-blockdrop')).toBeVisible();
    await page.mouse.up();
    await expect(page.locator('.aurebesh-blockdrop')).toHaveCount(0);
    const order = await content(page).evaluate((c) => Array.from(c.children).map((x) => x.tagName + (x.getAttribute('data-layout') ?? '') + ':' + (x.textContent ?? '')));
    expect(order).toEqual(['P:one', 'DIVrow:', 'P:two']);
  });

  test('the lower half of a paragraph is after it, the upper half before it', async ({ page }) => {
    await start(page);
    await block(page, 'divider').dragTo(content(page).locator('p').first(), { targetPosition: { x: 20, y: 2 } });
    expect(await html(page)).toMatch(/^<hr>|<hr><p>one/);
    await undo(page);
    await block(page, 'divider').dragTo(content(page).locator('p').first(), { targetPosition: { x: 20, y: 14 } });
    expect(await html(page)).toMatch(/<p>one<\/p><hr><p>two<\/p>/);
  });

  test('content dragged into a column goes into that column, in the place of its empty paragraph', async ({ page }) => {
    await start(page);
    await content(page).locator('p').first().click();
    await block(page, 'row2').click();
    await block(page, 'heading').dragTo(cols(page).nth(1));
    await expect(cols(page).nth(1).locator('h2')).toHaveText('Your heading');
    await expect(cols(page).nth(0).locator('h2')).toHaveCount(0);
    expect(await cols(page).nth(1).evaluate((c) => c.children.length)).toBe(1); // the empty paragraph made room for it
    await block(page, 'text').dragTo(cols(page).nth(0));
    await expect(cols(page).nth(0).locator('p')).toHaveText('Write your text here');
  });

  test('a row can be dragged into a column too: rows, columns, content', async ({ page }) => {
    await start(page);
    await content(page).locator('p').first().click();
    await block(page, 'row2').click();
    await block(page, 'row3').dragTo(cols(page).nth(0));
    await expect(cols(page).first().locator('[data-layout="row"]')).toHaveCount(1);
    await expect(cols(page).first().locator('[data-layout="row"] > [data-layout="col"]')).toHaveCount(3);
  });

  test('a block dropped in an empty text area goes in', async ({ page }) => {
    await start(page, '<p><br></p>');
    await block(page, 'row2').dragTo(content(page));
    await expect(rows(page)).toHaveCount(1);
  });

  test('files are still taken by the editor as before', async ({ page }) => {
    await start(page);
    expect(await content(page).locator('img').count()).toBe(0);
  });
});

test.describe('the row tools', () => {
  const tools = (page: Page) => page.locator('.aurebesh-row-tools');

  test('are there while the caret is in a row, and show its distribution and gap', async ({ page }) => {
    await start(page);
    await expect(tools(page)).toBeHidden();
    await content(page).locator('p').first().click();
    await block(page, 'row37').click();
    await expect(tools(page)).toBeVisible();
    await expect(page.locator('.aurebesh-rowlayout')).toHaveValue('3fr 7fr');
    await expect(page.locator('.aurebesh-rowgap')).toHaveValue('16');
    await content(page).locator('p').last().click();
    await expect(tools(page)).toBeHidden();
  });

  test('the distribution can be changed afterwards, also to more or fewer columns, without losing the content', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright cannot drive HTML5 drag and drop in WebKit (it is covered in Chromium and Firefox)');
    await start(page);
    await content(page).locator('p').first().click();
    await block(page, 'row2').click();
    await block(page, 'heading').dragTo(cols(page).nth(0));
    await block(page, 'text').dragTo(cols(page).nth(1));
    await cols(page).nth(1).locator('p').click();
    await page.locator('.aurebesh-rowlayout').selectOption('1fr 2fr 1fr');
    await expect(cols(page)).toHaveCount(3);
    expect(await rows(page).evaluate((r) => (r as HTMLElement).style.gridTemplateColumns)).toBe('1fr 2fr 1fr');
    await expect(cols(page).nth(0).locator('h2')).toHaveCount(1);
    await expect(cols(page).nth(1).locator('p')).toHaveText('Write your text here');
    await expect(cols(page).nth(2).locator('p')).toHaveText('');

    await cols(page).nth(1).locator('p').click();
    await page.locator('.aurebesh-rowlayout').selectOption('1fr');
    await expect(cols(page)).toHaveCount(1);
    await expect(cols(page).first().locator('h2')).toHaveCount(1); // what was in the columns that went is in the last one that stays
    await expect(cols(page).first().locator('p', { hasText: 'Write your text here' })).toHaveCount(1);
    await undo(page);
    await expect(cols(page)).toHaveCount(3);
  });

  test('the gap changes, and Delete takes the whole row away, in one step for undo', async ({ page }) => {
    await start(page);
    await content(page).locator('p').first().click();
    await block(page, 'row2').click();
    await page.locator('.aurebesh-rowgap').selectOption('32');
    expect(await rows(page).evaluate((r) => (r as HTMLElement).style.gap)).toBe('32px');
    await cols(page).first().locator('p').click();
    await page.locator('.aurebesh-row-tools button').click();
    await expect(rows(page)).toHaveCount(0);
    expect(await html(page)).toBe('<p>one</p><p>two</p>');
    await undo(page);
    await expect(rows(page)).toHaveCount(1);
  });

  test('another distribution that came with the HTML is shown as it is', async ({ page }) => {
    await start(page, '<p>x</p><div data-layout="row" style="display: grid; grid-template-columns: 20% 80%; gap: 8px"><div data-layout="col"><p>a</p></div><div data-layout="col"><p>b</p></div></div><p>y</p>');
    await cols(page).first().locator('p').click();
    await expect(page.locator('.aurebesh-rowlayout')).toHaveValue('20% 80%');
  });
});

test.describe('keeping the layout whole while typing', () => {
  test('Backspace at the start of a column and Delete at the end of it do nothing, so that the columns stay', async ({ page }) => {
    await start(page);
    await content(page).locator('p').first().click();
    await block(page, 'row2').click();
    await cols(page).nth(1).locator('p').click();
    await page.keyboard.type('right');
    await page.keyboard.press('Home');
    await page.keyboard.press('Backspace');
    await expect(cols(page)).toHaveCount(2);
    await expect(cols(page).nth(1)).toHaveText('right');
    await cols(page).nth(0).locator('p').click();
    await page.keyboard.type('left');
    await page.keyboard.press('End');
    await page.keyboard.press('Delete');
    await expect(cols(page)).toHaveCount(2);
    await expect(cols(page).nth(0)).toHaveText('left');
    await expect(cols(page).nth(1)).toHaveText('right');
  });

  test('Enter makes paragraphs in the column, and Backspace between them still joins them', async ({ page }) => {
    await start(page);
    await content(page).locator('p').first().click();
    await block(page, 'row2').click();
    await page.keyboard.type('one');
    await page.keyboard.press('Enter');
    await page.keyboard.type('two');
    await expect(cols(page).first().locator('p')).toHaveCount(2);
    await page.keyboard.press('Home');
    await page.keyboard.press('Backspace');
    await expect(cols(page).first().locator('p')).toHaveCount(1);
    await expect(cols(page)).toHaveCount(2);
  });

  test('the output has the layout, and nothing of the editor in it', async ({ page }) => {
    await start(page);
    await content(page).locator('p').first().click();
    await block(page, 'row2').click();
    const out = await html(page);
    expect(out).toContain('<div data-layout="row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px">');
    expect(out).not.toMatch(/data-new-block|aurebesh/);
    // set again from the output: the same layout
    await page.evaluate((h) => (window as any).ed.instance.setHTML(h), out);
    await expect(cols(page)).toHaveCount(2);
  });
});
