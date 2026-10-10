import { test } from '@playwright/test';
import { button, content, expect, html, open, selectAll, setHtml, type } from './helpers';

const HEBREW = 'שלום עולם';
const ARABIC = 'مرحبا بالعالم';

/** How far the first line of a block sits from the left and right edge of the editor's text area, in px. */
const gaps = (page: any, selector: string) =>
  page.evaluate((sel: string) => {
    const c = document.querySelector('.aurebesh-content') as HTMLElement;
    const block = c.querySelector(sel) ?? c; // the first text typed into an empty editor has no block around it
    const range = document.createRange();
    range.selectNodeContents(block);
    const text = range.getBoundingClientRect();
    const box = c.getBoundingClientRect();
    return { left: text.left - box.left, right: box.right - text.right };
  }, selector);

test.describe('right-to-left text', () => {
  test('Hebrew and Arabic paragraphs run right-to-left by themselves, English stays on the left', async ({ page }) => {
    await open(page, `<p>${HEBREW}</p><p>${ARABIC}</p><p>English</p>`);
    const he = await gaps(page, 'p:nth-child(1)');
    const ar = await gaps(page, 'p:nth-child(2)');
    const en = await gaps(page, 'p:nth-child(3)');
    expect(he.right).toBeLessThan(he.left);
    expect(ar.right).toBeLessThan(ar.left);
    expect(en.left).toBeLessThan(en.right);
  });

  test('typing Arabic works and is stored as typed', async ({ page }) => {
    await open(page);
    await type(page, ARABIC);
    expect(await html(page)).toContain(ARABIC);
    const g = await gaps(page, 'p, div');
    expect(g.right).toBeLessThan(g.left);
  });

  test('a mixed paragraph gets its direction from its first strong letter', async ({ page }) => {
    await open(page, `<p>${HEBREW} and English words</p><p>English and ${HEBREW}</p>`);
    const first = await gaps(page, 'p:nth-child(1)');
    const second = await gaps(page, 'p:nth-child(2)');
    expect(first.right).toBeLessThan(first.left);
    expect(second.left).toBeLessThan(second.right);
  });

  test('the direction buttons set dir on the block, a second click goes back to automatic', async ({ page }) => {
    await open(page, '<p>one</p><p>two</p>');
    await page.evaluate(() => ((window as any).ed.options = { toolbar: ['ltr', 'rtl', 'bold'] }));
    await selectAll(page);
    await button(page, 'Right to left').click();
    expect(await html(page)).toBe('<p dir="rtl">one</p><p dir="rtl">two</p>');
    const g = await gaps(page, 'p:nth-child(1)');
    expect(g.right).toBeLessThan(g.left);
    await expect(button(page, 'Right to left')).toHaveAttribute('aria-pressed', 'true');
    await button(page, 'Right to left').click();
    expect(await html(page)).toBe('<p>one</p><p>two</p>');
    await button(page, 'Left to right').click();
    expect(await html(page)).toBe('<p dir="ltr">one</p><p dir="ltr">two</p>');
  });

  test('a list gets its direction on the list, so the bullets move too', async ({ page }) => {
    await open(page, `<ul><li>${HEBREW}</li><li>b</li></ul>`);
    await page.evaluate(() => ((window as any).ed.options = { toolbar: ['rtl'] }));
    await content(page).locator('li').first().click();
    await button(page, 'Right to left').click();
    expect(await html(page)).toBe(`<ul dir="rtl"><li>${HEBREW}</li><li>b</li></ul>`);
  });

  test('dir survives a reload through the sanitizer, but only on blocks and only ltr/rtl', async ({ page }) => {
    await open(page);
    await setHtml(page, '<p dir="RTL">a</p><p dir="evil">b</p><p><span dir="rtl">c</span></p><table><tbody><tr><td dir="rtl">d</td></tr></tbody></table>');
    const out = await html(page);
    expect(out).toContain('<p dir="rtl">a</p>');
    expect(out).toContain('<p>b</p>');
    expect(out).not.toContain('<span');
    expect(out).toContain('<td dir="rtl">d</td>');
  });

  test('the toolbar and the quote bar mirror when the page is right-to-left', async ({ page }) => {
    await open(page, `<blockquote>${HEBREW}</blockquote>`);
    await page.evaluate(() => (document.documentElement.dir = 'rtl'));
    const order = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('.aurebesh-toolbar button'));
      return { first: buttons[0].getBoundingClientRect().left, last: buttons[buttons.length - 1].getBoundingClientRect().left };
    });
    expect(order.first).toBeGreaterThan(order.last);
    const bar = await page.evaluate(() => {
      const q = getComputedStyle(document.querySelector('.aurebesh-content blockquote')!);
      return { right: q.borderRightWidth, left: q.borderLeftWidth };
    });
    expect(bar.right).toBe('3px');
    expect(bar.left).toBe('0px');
  });

  test('words and characters are counted in Arabic and Hebrew', async ({ page }) => {
    await open(page, `<p>${ARABIC}</p><p>${HEBREW}</p>`);
    const stats = await page.evaluate(() => (window as any).ed.instance.getStats());
    expect(stats.words).toBe(4);
    expect(stats.characters).toBe(ARABIC.length + HEBREW.length);
  });

  test('Markdown and text output keep the letters intact', async ({ page }) => {
    await open(page, `<p dir="rtl">${HEBREW}</p>`);
    expect(await page.evaluate(() => (window as any).ed.markdown)).toBe(HEBREW);
    expect(await page.evaluate(() => (window as any).ed.text)).toBe(HEBREW);
  });
});
