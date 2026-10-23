import { test } from '@playwright/test';
import { content, expect, open } from './helpers';

const bar = (page: import('@playwright/test').Page) => page.locator('.aurebesh-quickbar');

test.describe('the strip above the toolbar', () => {
  test('`|` is a thin line between groups of buttons, and `>` pushes what follows to the end of the strip', async ({ page }) => {
    await open(page, '<p>text</p>');
    await page.evaluate(() => ((window as any).ed.options = { toolbar: ['bold'], quickbar: ['undo', 'redo', '|', 'find', '>', 'sidebar', 'fullscreen'] }));
    await content(page).waitFor();
    await expect(bar(page).locator('.aurebesh-quick-sep')).toHaveCount(1);
    await expect(bar(page).locator('.aurebesh-quick-sep')).toHaveAttribute('role', 'separator');
    await expect(bar(page).locator('.aurebesh-quick-spacer')).toHaveCount(1);
    const strip = (await bar(page).boundingBox())!;
    const find = (await bar(page).locator('.aurebesh-cmd-find').boundingBox())!;
    const fullscreen = (await bar(page).locator('.aurebesh-cmd-fullscreen').boundingBox())!;
    const undo = (await bar(page).locator('.aurebesh-cmd-undo').boundingBox())!;
    expect(undo.x - strip.x).toBeLessThan(12); // the start of the strip
    expect(strip.x + strip.width - (fullscreen.x + fullscreen.width)).toBeLessThan(12); // the end of the strip
    expect(fullscreen.x - (find.x + find.width)).toBeGreaterThan(100); // with room between
    // the line is between redo and find
    const sep = (await bar(page).locator('.aurebesh-quick-sep').boundingBox())!;
    const redo = (await bar(page).locator('.aurebesh-cmd-redo').boundingBox())!;
    expect(sep.x).toBeGreaterThan(redo.x + redo.width - 1);
    expect(sep.x + sep.width).toBeLessThan(find.x + 1);
  });

  test('the arrow keys go along the buttons and skip the lines and the space', async ({ page }) => {
    await open(page, '<p>text</p>');
    await page.evaluate(() => ((window as any).ed.options = { toolbar: ['bold'], quickbar: ['undo', '|', 'find', '>', 'fullscreen'] }));
    await content(page).waitFor();
    await bar(page).locator('.aurebesh-cmd-undo').focus();
    await page.keyboard.press('ArrowRight');
    await expect(bar(page).locator('.aurebesh-cmd-find')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(bar(page).locator('.aurebesh-cmd-fullscreen')).toBeFocused();
  });

  test('a menu and a panel button work in the strip as they do in the toolbar', async ({ page }) => {
    await open(page, '<p>text</p>');
    await page.evaluate(() => ((window as any).ed.options = { toolbar: ['bold'], quickbar: ['export', '|', 'comments'], comments: { author: { id: 'me', name: 'Me' } } }));
    await content(page).waitFor();
    await bar(page).locator('.aurebesh-cmd-export').click();
    await expect(page.locator('.aurebesh-export-pop:not([hidden])')).toBeVisible();
    await page.keyboard.press('Escape');
    await bar(page).locator('.aurebesh-cmd-comments').click();
    await expect(page.locator('.aurebesh-panel')).toBeVisible();
  });
});
