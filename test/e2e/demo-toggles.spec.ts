import { test } from '@playwright/test';
import { expect } from './helpers';

const part = (page: import('@playwright/test').Page, id: string) => page.locator(`#parts input[data-part="${id}"]`);

test.describe('the parts of the editor demo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/demo/');
    await expect(page.locator('aurebesh-editor .aurebesh-content')).toBeVisible();
  });

  test('every part has a switch, and all but read only start on', async ({ page }) => {
    await expect(page.locator('#parts input')).toHaveCount(13);
    await expect(part(page, 'comments')).toBeChecked();
    await expect(part(page, 'readonly')).not.toBeChecked();
  });

  test('switching a part off takes it out of the editor, and on brings it back; the text stays', async ({ page }) => {
    const editor = page.locator('aurebesh-editor');
    await editor.locator('.aurebesh-content').click();
    await page.keyboard.press('End');
    await page.keyboard.type('KEEPME');
    await expect(editor.locator('.aurebesh-cmd-comment').first()).toBeVisible();

    await part(page, 'comments').uncheck();
    await part(page, 'suggestions').uncheck();
    await part(page, 'counter').uncheck();
    await part(page, 'modes').uncheck();
    await expect(editor.locator('.aurebesh-content')).toContainText('KEEPME');
    await expect(editor.locator('.aurebesh-cmd-comment, .aurebesh-cmd-suggest')).toHaveCount(0);

    await part(page, 'comments').check();
    await expect(editor.locator('.aurebesh-cmd-comment').first()).toBeVisible();
    await expect(editor.locator('.aurebesh-content')).toContainText('KEEPME');
  });

  test('read only locks the text', async ({ page }) => {
    await part(page, 'readonly').check();
    await expect(page.locator('aurebesh-editor .aurebesh-content')).toHaveAttribute('contenteditable', 'false');
    await part(page, 'readonly').uncheck();
    await expect(page.locator('aurebesh-editor .aurebesh-content')).toHaveAttribute('contenteditable', 'true');
  });
});
