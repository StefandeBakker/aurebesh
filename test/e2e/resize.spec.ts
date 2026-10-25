import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { content, expect, open } from './helpers';

const bar = (page: Page) => page.locator('.aurebesh-resize');
const LONG = '<p>' + 'A line of text. '.repeat(10) + '</p>'.repeat(1) + '<p>two</p>'.repeat(40);

/** The height of what the bar changes: the text with the sidebar beside it, or the text. */
const height = (page: Page) =>
  page.evaluate(() => {
    const el = (document.querySelector('.aurebesh-body') ?? document.querySelector('.aurebesh-stage')) as HTMLElement;
    return Math.round(el.getBoundingClientRect().height);
  });

const start = async (page: Page, initial = '<p>one</p>', options: Record<string, unknown> = {}) => {
  await open(page);
  await page.evaluate((o) => {
    const w = window as any;
    w.sizes = [];
    w.ed.addEventListener('resized', (e: CustomEvent) => w.sizes.push(e.detail));
    if (Object.keys(o).length) w.ed.options = o;
  }, options);
  await content(page).waitFor();
  await page.evaluate((v) => (window as any).ed.instance.setHTML(v), initial);
};

const sizes = (page: Page) => page.evaluate(() => (window as any).sizes as (number | null)[]);

/** Drags the bar `dy` pixels down (up when negative). */
async function drag(page: Page, dy: number) {
  await bar(page).scrollIntoViewIfNeeded();
  const box = (await bar(page).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + dy / 2, { steps: 4 });
  await page.mouse.move(x, y + dy, { steps: 4 });
  await page.mouse.up();
}

test.describe('the height of the editor', () => {
  test('there is a bar under the text, a separator with its limits, and until it is used the editor is as high as the text', async ({ page }) => {
    await start(page);
    await expect(bar(page)).toBeVisible();
    await expect(bar(page)).toHaveAttribute('role', 'separator');
    await expect(bar(page)).toHaveAttribute('aria-orientation', 'horizontal');
    await expect(bar(page)).toHaveAttribute('aria-valuemin', '150');
    const box = (await bar(page).boundingBox())!;
    const root = (await page.locator('.aurebesh').boundingBox())!;
    expect(box.y + box.height).toBeGreaterThan(root.y + root.height - 4); // the bottom of the editor
    await expect(page.locator('.aurebesh')).not.toHaveClass(/aurebesh-sized/);
    expect(await page.evaluate(() => (window as any).ed.instance.getHeight())).toBeNull();
    // it grows with the text
    const low = await height(page);
    await page.evaluate((v) => (window as any).ed.instance.setHTML(v), '<p>x</p>'.repeat(60));
    expect(await height(page)).toBeGreaterThan(low + 200);
  });

  test('dragging the bar down makes the editor higher, and the text scrolls inside it', async ({ page }) => {
    await start(page, LONG);
    await page.setViewportSize({ width: 900, height: 1400 });
    const before = await height(page);
    await drag(page, -(before - 300)); // down to 300
    expect(await height(page)).toBe(300);
    await expect(page.locator('.aurebesh')).toHaveClass(/aurebesh-sized/);
    // the text is higher than the editor, and scrolls
    const scrolls = await page.evaluate(() => {
      const c = document.querySelector('.aurebesh-content') as HTMLElement;
      const s = document.querySelector('.aurebesh-stage') as HTMLElement;
      return Math.max(c.scrollHeight - c.clientHeight, s.scrollHeight - s.clientHeight) > 100;
    });
    expect(scrolls).toBe(true);
    await drag(page, 120);
    expect(await height(page)).toBe(420);
    expect(await page.evaluate(() => (window as any).ed.instance.getHeight())).toBe(420);
  });

  test('the event comes when the drag is over, with the height', async ({ page }) => {
    await start(page, LONG);
    await page.setViewportSize({ width: 900, height: 1400 });
    await drag(page, -((await height(page)) - 320));
    expect(await sizes(page)).toEqual([320]);
  });

  test('it cannot be lower than the minimum, and not higher than the window', async ({ page }) => {
    await start(page, LONG);
    await page.setViewportSize({ width: 900, height: 800 });
    await page.evaluate(() => (window as any).ed.instance.setHeight(400));
    await drag(page, -450);
    expect(await height(page)).toBe(150);
    // the highest is the height of the window
    await expect(bar(page)).toHaveAttribute('aria-valuemax', '800');
    await bar(page).focus();
    await page.keyboard.press('End');
    expect(await height(page)).toBe(800);
    await page.setViewportSize({ width: 900, height: 600 }); // a window that gets lower takes the editor along
    await expect.poll(() => height(page)).toBe(600);
  });

  test('dragging past the maximum of the options stops at it', async ({ page }) => {
    await start(page, LONG, { resizable: { height: 200, max: 320 } });
    await page.setViewportSize({ width: 900, height: 900 });
    await drag(page, 300);
    expect(await height(page)).toBe(320);
  });

  test('the options give the height to start with, the minimum and the maximum', async ({ page }) => {
    await start(page, LONG, { resizable: { height: 400, min: 200, max: 500 } });
    expect(await height(page)).toBe(400);
    await expect(bar(page)).toHaveAttribute('aria-valuenow', '400');
    await expect(bar(page)).toHaveAttribute('aria-valuemin', '200');
    await expect(bar(page)).toHaveAttribute('aria-valuemax', '500');
    await bar(page).focus();
    await page.keyboard.press('End');
    expect(await height(page)).toBe(500);
    await page.keyboard.press('Home');
    expect(await height(page)).toBe(200);
  });

  test('the arrow keys change the height, Page Up and Page Down in larger steps, and Enter goes back to the start', async ({ page }) => {
    await start(page, LONG, { resizable: { height: 400 } });
    await bar(page).focus();
    await page.keyboard.press('ArrowDown');
    expect(await height(page)).toBe(424);
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    expect(await height(page)).toBe(376);
    await page.keyboard.press('PageDown');
    expect(await height(page)).toBe(576);
    await page.keyboard.press('PageUp');
    expect(await height(page)).toBe(376);
    await page.keyboard.press('Enter');
    expect(await height(page)).toBe(400);
    await expect(bar(page)).toHaveAttribute('aria-valuenow', '400');
  });

  test('a double click on the bar goes back to the start: as high as the text, or the height of the options', async ({ page }) => {
    await start(page, '<p>one</p>');
    const natural = await height(page);
    await page.evaluate(() => (window as any).ed.instance.setHeight(500));
    expect(await height(page)).toBe(500);
    await bar(page).dblclick();
    expect(await height(page)).toBe(natural);
    await expect(page.locator('.aurebesh')).not.toHaveClass(/aurebesh-sized/);
    expect((await sizes(page)).slice(-1)).toEqual([null]);

    await start(page, LONG, { resizable: { height: 300 } });
    await page.evaluate(() => (window as any).ed.instance.setHeight(600));
    await bar(page).dblclick();
    expect(await height(page)).toBe(300);
  });

  test('setHeight and getHeight work from code, within the limits', async ({ page }) => {
    await start(page);
    await page.evaluate(() => (window as any).ed.instance.setHeight(420));
    expect(await height(page)).toBe(420);
    await page.evaluate(() => (window as any).ed.instance.setHeight(10));
    expect(await page.evaluate(() => (window as any).ed.instance.getHeight())).toBe(150);
    await page.evaluate(() => (window as any).ed.instance.setHeight(null));
    expect(await page.evaluate(() => (window as any).ed.instance.getHeight())).toBeNull();
  });

  test('a finger can drag it too', async ({ page }) => {
    await start(page, LONG);
    await page.setViewportSize({ width: 900, height: 1400 });
    const start0 = await height(page);
    await bar(page).evaluate((el, dy) => {
      const r = el.getBoundingClientRect();
      const y = r.top + r.height / 2;
      const init = { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: r.left + 40 };
      el.dispatchEvent(new PointerEvent('pointerdown', { ...init, clientY: y }));
      el.dispatchEvent(new PointerEvent('pointermove', { ...init, clientY: y + dy }));
      el.dispatchEvent(new PointerEvent('pointerup', { ...init, clientY: y + dy }));
    }, -(start0 - 260));
    expect(await height(page)).toBe(260);
  });

  test('with the sidebar beside the text the whole of it gets the height, and the sidebar scrolls inside it', async ({ page }) => {
    await start(page, LONG, { toolbar: ['bold', 'sidebar'] });
    await page.locator('.aurebesh-toolbar .aurebesh-cmd-sidebar').click();
    await page.evaluate(() => (window as any).ed.instance.setHeight(320));
    expect(await height(page)).toBe(320);
    const panel = await page.locator('.aurebesh-panel').boundingBox();
    expect(panel!.height).toBeLessThanOrEqual(320);
  });

  test('on a page format the sheet scrolls in the height', async ({ page }) => {
    await start(page, LONG, { page: 'a4' });
    await page.evaluate(() => (window as any).ed.instance.setHeight(350));
    expect(await height(page)).toBe(350);
  });

  test('full screen has no bar and fills the window; the height comes back after it', async ({ page }) => {
    await start(page, LONG, { toolbar: ['bold', 'fullscreen'], resizable: { height: 300 } });
    const toggle = page.locator('.aurebesh-toolbar .aurebesh-cmd-fullscreen');
    await toggle.click();
    await expect(page.locator('.aurebesh')).toHaveClass(/aurebesh-fullscreen/);
    await expect(bar(page)).toBeHidden();
    expect(await height(page)).toBeGreaterThan(400);
    await toggle.click();
    await expect(bar(page)).toBeVisible();
    expect(await height(page)).toBe(300);
  });

  test('where the page gives the text a maximum height, the height of the user is the one that counts', async ({ page }) => {
    await start(page, LONG);
    await page.addStyleTag({ content: 'aurebesh-editor{display:block;--aurebesh-max-height:300px}' });
    await page.setViewportSize({ width: 900, height: 1400 });
    expect(await height(page)).toBeLessThanOrEqual(330); // the maximum of the page, as it always was
    await page.evaluate(() => (window as any).ed.instance.setHeight(700));
    expect(await height(page)).toBe(700);
    await bar(page).dblclick();
    expect(await height(page)).toBeLessThanOrEqual(330); // and back to it
  });

  test('false leaves the bar out, and there is no height to set', async ({ page }) => {
    await start(page, '<p>one</p>', { resizable: false });
    await expect(bar(page)).toHaveCount(0);
    await page.evaluate(() => (window as any).ed.instance.setHeight(500));
    expect(await page.evaluate(() => (window as any).ed.instance.getHeight())).toBeNull();
  });

  test('the bar is not in the way of the text: clicking and typing above it works as before', async ({ page }) => {
    await start(page, '<p>one</p>');
    await content(page).click();
    await page.keyboard.type('x');
    expect(await page.evaluate(() => (window as any).ed.instance.getHTML())).toContain('x');
  });
});
