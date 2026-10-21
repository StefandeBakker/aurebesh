import { test } from '@playwright/test';
import { button, content, expect, open, setHtml } from './helpers';

test.describe('code blocks', () => {
  test('Enter adds lines, Tab indents, a second Enter leaves the block', async ({ page }) => {
    await open(page);
    await content(page).click();
    await button(page, 'Code block').click();
    await page.keyboard.type('a');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.type('b');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('after');
    const pre = await page.evaluate(() => (document.querySelector('.aurebesh-content pre') as HTMLElement).innerText);
    expect(pre.replace(/ /g, ' ')).toBe('a\n  b');
    expect(await page.locator('.aurebesh-content > p').last().textContent()).toBe('after');
    expect(await page.locator('.aurebesh-content pre').count()).toBe(1);
  });

  test('pasting multi-line code with HTML blocks keeps a single code block', async ({ page }) => {
    await open(page);
    await content(page).click();
    await button(page, 'Code block').click();
    await page.evaluate(() =>
      (window as any).__paste({ text: 'function a() {\n  return 1;\n}', html: '<div><div>function a() {</div><div>&nbsp; return 1;</div><div>}</div></div>' }),
    );
    expect(await page.locator('.aurebesh-content pre').count()).toBe(1);
    const text = await page.evaluate(() => (document.querySelector('.aurebesh-content pre') as HTMLElement).innerText);
    expect(text.replace(/ /g, ' ')).toContain('function a() {\n  return 1;\n}');
  });

  test('syntax highlighting is painted (where the browser supports the Highlight API)', async ({ page }) => {
    await open(page);
    const supported = await page.evaluate(() => 'highlights' in CSS && typeof (window as any).Highlight === 'function');
    test.skip(!supported, 'CSS Custom Highlight API not available in this browser');
    await setHtml(page, '<pre>const a = "x"; // note\n</pre>');
    await expect
      .poll(() => page.evaluate(() => ['keyword', 'string', 'comment'].every((t) => CSS.highlights.has(`aurebesh-${t}`))))
      .toBe(true);
  });
});
