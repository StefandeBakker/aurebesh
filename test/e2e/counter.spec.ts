import { test } from '@playwright/test';
import { content, expect, open, selectAll, type } from './helpers';

const ed = (page: any) => page.locator('aurebesh-editor');

test.describe('counter, max length and ready', () => {
  test('the counter shows words and characters and follows the typing', async ({ page }) => {
    await open(page);
    await ed(page).evaluate((el: HTMLElement) => el.setAttribute('counter', ''));
    const counter = page.locator('.aurebesh-count');
    await expect(counter).toBeVisible();
    await expect(counter).toHaveText('0 words · 0 characters');
    await type(page, 'one two');
    await expect(counter).toHaveText('2 words · 7 characters');
  });

  test('typing stops at maxlength and says so; deleting still works', async ({ page }) => {
    await open(page);
    await ed(page).evaluate((el: HTMLElement) => {
      el.setAttribute('maxlength', '5');
      el.setAttribute('counter', '');
    });
    await type(page, 'abcdefgh');
    expect((await content(page).innerText()).trim()).toBe('abcde');
    await expect(page.locator('.aurebesh-status.error')).toContainText('5');
    await page.keyboard.press('Backspace');
    expect((await content(page).innerText()).trim()).toBe('abcd');
    await page.keyboard.type('xyz');
    expect((await content(page).innerText()).trim()).toBe('abcdx');
  });

  test('typing over a selection is allowed when the replacement fits', async ({ page }) => {
    await open(page);
    await ed(page).evaluate((el: HTMLElement) => el.setAttribute('maxlength', '5'));
    await type(page, 'abcde');
    await selectAll(page);
    await page.keyboard.type('xy');
    expect((await content(page).innerText()).trim()).toBe('xy');
  });

  test('a paste is cut off at the limit', async ({ page }) => {
    await open(page);
    await ed(page).evaluate((el: HTMLElement) => el.setAttribute('maxlength', '6'));
    await type(page, 'ab');
    await page.evaluate(() => (window as any).__paste({ text: 'cdefghij', html: '<p>cdefghij</p>' }));
    expect((await content(page).innerText()).trim()).toBe('abcdef');
  });

  test('content set through setHTML is kept but flagged as too long to the form', async ({ page }) => {
    await open(page);
    await ed(page).evaluate((el: any) => {
      el.setAttribute('maxlength', '3');
      el.setAttribute('counter', '');
      el.instance.setHTML('<p>much longer</p>');
    });
    await expect(page.locator('.aurebesh-count')).toHaveClass(/over/);
    expect(await ed(page).evaluate((el: any) => el.validity.tooLong)).toBe(true);
    expect(await ed(page).evaluate((el: any) => el.instance.isOverLimit())).toBe(true);
  });

  test('ready and count events fire', async ({ page }) => {
    await page.goto('/test/e2e/page.html');
    await page.locator('.aurebesh-content').waitFor();
    const result = await page.evaluate(async () => {
      const el = document.createElement('aurebesh-editor') as any;
      const seen: string[] = [];
      let stats: any = null;
      el.addEventListener('ready', () => seen.push('ready'));
      el.addEventListener('count', (e: CustomEvent) => (stats = e.detail));
      document.body.appendChild(el);
      await new Promise((r) => setTimeout(r, 50));
      el.value = '<p>hello big world</p>';
      await new Promise((r) => setTimeout(r, 50));
      const late = await el.instance.whenReady().then(() => 'late');
      el.remove();
      return { seen, stats, late };
    });
    expect(result.seen).toEqual(['ready']);
    expect(result.stats.words).toBe(3);
    expect(result.late).toBe('late');
  });
});
