import { test } from '@playwright/test';
import { content, expect, open } from './helpers';

test.describe('the sidebar toggle', () => {
  test('one button shows and hides the sidebar, which has the layout and the blocks as tabs', async ({ page }) => {
    await open(page, '<p>text</p>');
    await page.evaluate(() => ((window as any).ed.options = { toolbar: ['bold', 'sidebar'] }));
    const toggle = page.locator('.aurebesh-cmd-sidebar');
    await expect(page.locator('.aurebesh-panel')).toBeHidden();
    await toggle.click();
    await expect(page.locator('.aurebesh-panel')).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('[role="tab"]')).toHaveText(['Layout', 'Blocks']);
    await page.getByRole('tab', { name: 'Blocks' }).click();
    await expect(page.locator('.aurebesh-block[data-block="row2"]')).toBeVisible();
    await toggle.click();
    await expect(page.locator('.aurebesh-panel')).toBeHidden();
    await toggle.click();
    await expect(page.getByRole('tab', { name: 'Blocks' })).toHaveAttribute('aria-selected', 'true'); // where it was
  });

  test('the blocks work from the sidebar of the toggle, and the toggle looks pressed while it is open', async ({ page }) => {
    await open(page, '<p>one</p><p>two</p>');
    await page.evaluate(() => ((window as any).ed.options = { toolbar: ['bold', 'sidebar'] }));
    await page.locator('.aurebesh-cmd-sidebar').click();
    await page.getByRole('tab', { name: 'Blocks' }).click();
    await content(page).locator('p').first().click();
    await page.locator('.aurebesh-block[data-block="row2"]').click();
    await expect(content(page).locator('[data-layout="col"]')).toHaveCount(2);
    await expect(page.locator('.aurebesh-row-tools')).toBeVisible();
    const bg = await page.locator('.aurebesh-cmd-sidebar').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('Escape closes it and gives the focus back to the toggle', async ({ page }) => {
    await open(page, '<p>text</p>');
    await page.evaluate(() => ((window as any).ed.options = { toolbar: ['bold', 'sidebar'] }));
    await page.locator('.aurebesh-cmd-sidebar').click();
    await page.getByRole('tab', { name: 'Layout' }).focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('.aurebesh-panel')).toBeHidden();
    await expect(page.locator('.aurebesh-cmd-sidebar')).toBeFocused();
  });
});
