import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { content, expect, html, open, setHtml } from './helpers';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const YT = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';
const VM = 'https://player.vimeo.com/video/76979871';
const frame = (page: Page) => page.locator('.aurebesh-media-frame');
const handle = (page: Page, dir: string) => page.locator(`.aurebesh-media-handle[data-dir="${dir}"]`);
const box = async (page: Page, selector: string) => (await content(page).locator(selector).first().boundingBox())!;
const getHtml = (page: Page) => page.evaluate(() => (window as any).ed.instance.getHTML() as string);

/** Drags a handle by (dx, dy) pixels with the mouse. */
async function drag(page: Page, dir: string, dx: number, dy: number) {
  const h = (await handle(page, dir).boundingBox())!;
  const x = h.x + h.width / 2;
  const y = h.y + h.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
}

const picture = `<p><img src="${PNG}" style="width: 200px; aspect-ratio: 2 / 1"></p>`;

test.describe('the size of pictures and videos', () => {
  test('an embedded video without a size has the usual 16:9, in its own style, so it is not a thumbnail elsewhere', async ({ page }) => {
    await open(page);
    await setHtml(page, `<p>x</p><iframe src="${YT}"></iframe>`);
    expect(await getHtml(page)).toMatch(/<iframe[^>]*style="width: 560px; max-width: 100%; aspect-ratio: 16 \/ 9"/);
    const b = await box(page, 'iframe');
    expect(Math.round(b.width)).toBeGreaterThan(300);
    expect(Math.abs(b.width / b.height - 16 / 9)).toBeLessThan(0.02);
  });

  test('keeps a size that is given, and drops what is not a size', async ({ page }) => {
    await open(page);
    await setHtml(page, `<iframe src="${YT}" style="width: 320px; position: fixed; aspect-ratio: 16 / 9; max-width: 100%"></iframe>`);
    const out = await getHtml(page);
    expect(out).toContain('width: 320px');
    expect(out).toContain('aspect-ratio: 16 / 9');
    expect(out).not.toContain('position');
  });

  test('a click on a picture puts the frame with eight handles around it', async ({ page }) => {
    await open(page);
    await setHtml(page, `<p>one <img src="${PNG}" style="width: 200px; aspect-ratio: 2 / 1"> two</p>`);
    await expect(frame(page)).toBeHidden();
    await content(page).locator('img').click();
    await expect(frame(page)).toBeVisible();
    await expect(page.locator('.aurebesh-media-handle')).toHaveCount(8);
  });

  test('dragging a corner scales the picture and keeps its shape; undo brings back the old size', async ({ page }) => {
    await open(page);
    await setHtml(page, picture);
    await content(page).locator('img').click();
    await drag(page, 'se', 100, 0);
    const b = await box(page, 'img');
    expect(Math.round(b.width)).toBe(300);
    expect(Math.round(b.height)).toBe(150);
    const style = await content(page).locator('img').getAttribute('style');
    for (const part of ['width: 300px', 'height: auto', 'aspect-ratio: 300 / 150', 'max-width: 100%']) expect(style).toContain(part);
    await page.evaluate(() => (window as any).ed.instance.undo());
    expect(Math.round((await box(page, 'img')).width)).toBe(200);
  });

  test('a side changes that side, and the other follows; Shift makes it free', async ({ page }) => {
    await open(page);
    await setHtml(page, picture);
    await content(page).locator('img').click();
    await drag(page, 's', 0, 50);
    let b = await box(page, 'img');
    expect(Math.round(b.height)).toBe(150);
    expect(Math.round(b.width)).toBe(300);
    await page.keyboard.down('Shift');
    await drag(page, 's', 0, 50);
    await page.keyboard.up('Shift');
    b = await box(page, 'img');
    expect(Math.round(b.width)).toBe(300);
    expect(Math.round(b.height)).toBe(200);
  });

  test('a picture is never made wider than the text, nor narrower than a few pixels', async ({ page }) => {
    await open(page);
    await setHtml(page, picture);
    await content(page).locator('img').click();
    await drag(page, 'e', 5000, 0);
    const text = (await content(page).boundingBox())!;
    expect((await box(page, 'img')).width).toBeLessThanOrEqual(text.width);
    await drag(page, 'w', 5000, 0);
    expect((await box(page, 'img')).width).toBeGreaterThanOrEqual(24);
  });

  test('an embedded video is picked by its box and scaled like a picture', async ({ page }) => {
    await open(page);
    await setHtml(page, `<p>text</p><div><iframe src="${YT}"></iframe></div><p>after</p>`);
    const b = await box(page, 'iframe');
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await expect(frame(page)).toBeVisible();
    await drag(page, 'e', -160, 0);
    const after = await box(page, 'iframe');
    expect(Math.round(after.width)).toBe(Math.round(b.width) - 160);
    expect(Math.abs(after.width / after.height - 16 / 9)).toBeLessThan(0.02);
    expect(await getHtml(page)).toMatch(/<iframe[^>]*width: \d+px/);
  });

  test('the fields give the size in pixels, with the shape kept or not', async ({ page }) => {
    await open(page);
    await setHtml(page, picture);
    await content(page).locator('img').click();
    const w = page.locator('.aurebesh-size-width');
    const h = page.locator('.aurebesh-size-height');
    await expect(w).toHaveValue('200');
    await expect(h).toHaveValue('100');
    await h.fill('150');
    await h.press('Enter');
    await expect(w).toHaveValue('300');
    await page.locator('.aurebesh-size-lock').click();
    await h.fill('60');
    await h.press('Enter');
    await expect(w).toHaveValue('300');
    await expect(h).toHaveValue('60');
  });

  test('two pictures can be given the same height', async ({ page }) => {
    await open(page);
    await setHtml(page, `<p><img src="${PNG}" style="width: 200px; aspect-ratio: 2 / 1"> <img src="${PNG}" style="width: 90px; aspect-ratio: 3 / 2"></p>`);
    for (const i of [0, 1]) {
      await content(page).locator('img').nth(i).click();
      const h = page.locator('.aurebesh-size-height');
      await h.fill('120');
      await h.press('Enter');
    }
    const heights = await content(page).locator('img').evaluateAll((imgs) => imgs.map((i) => Math.round(i.getBoundingClientRect().height)));
    expect(heights).toEqual([120, 120]);
    const tops = await content(page).locator('img').evaluateAll((imgs) => imgs.map((i) => Math.round(i.getBoundingClientRect().top)));
    expect(tops[0]).toBe(tops[1]); // next to each other
  });

  test('two videos fit on one line when they are small enough', async ({ page }) => {
    await open(page);
    await setHtml(page, `<p><iframe src="${YT}" style="width: 240px; aspect-ratio: 16 / 9; max-width: 100%"></iframe> <iframe src="${VM}" style="width: 240px; aspect-ratio: 16 / 9; max-width: 100%"></iframe></p>`);
    const tops = await content(page).locator('iframe').evaluateAll((fs) => fs.map((f) => Math.round(f.getBoundingClientRect().top)));
    expect(tops[0]).toBe(tops[1]);
  });

  test('Delete removes the picked embed', async ({ page }) => {
    await open(page);
    await setHtml(page, `<p>one</p><div><iframe src="${YT}"></iframe></div><p>two</p>`);
    const b = await box(page, 'iframe');
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await expect(frame(page)).toBeVisible();
    await page.keyboard.press('Delete');
    await expect(content(page).locator('iframe')).toHaveCount(0);
    await expect(frame(page)).toBeHidden();
  });

  test('a read-only editor has no frame', async ({ page }) => {
    await open(page);
    await setHtml(page, picture);
    await page.evaluate(() => (window as any).ed.instance.setReadOnly(true));
    await content(page).locator('img').click();
    await expect(frame(page)).toBeHidden();
  });
});
