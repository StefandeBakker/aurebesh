import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { content, expect, html, open } from './helpers';

const start = async (page: Page, initial: string, extra = '{}') => {
  await open(page, initial);
  await page.evaluate((e) => ((window as any).ed.options = { modes: true, counter: true, ...JSON.parse(e) }), extra);
  await page.locator('.aurebesh-modes').waitFor();
};
const radio = (page: Page, mode: string) => page.locator(`.aurebesh-mode[data-mode="${mode}"]`);

test.describe('the views of the content', () => {
  test('the numbers are bottom left and the switch bottom right, in one footer', async ({ page }) => {
    await start(page, '<p>one two three</p>');
    const footer = (await page.locator('.aurebesh-footer').boundingBox())!;
    const count = (await page.locator('.aurebesh-count').boundingBox())!;
    const modes = (await page.locator('.aurebesh-modes').boundingBox())!;
    expect(count.x).toBeLessThan(footer.x + 40);
    expect(modes.x + modes.width).toBeGreaterThan(footer.x + footer.width - 40);
    expect(count.x + count.width).toBeLessThanOrEqual(modes.x);
    const root = (await page.locator('.aurebesh').boundingBox())!;
    const grip = (await page.locator('.aurebesh-resize').boundingBox())!;
    expect(footer.y + footer.height).toBeLessThanOrEqual(grip.y + 1); // above the bar for the height
    expect(grip.y + grip.height).toBeGreaterThan(root.y + root.height - 10); // which is at the bottom
  });

  test('Markdown can be typed, goes back to the editor as formatted text, and the toolbar stays out of use meanwhile', async ({ page }) => {
    await start(page, '<p>start</p>');
    await radio(page, 'markdown').click();
    const field = page.locator('.aurebesh-source');
    await expect(field).toBeVisible();
    await expect(content(page)).toBeHidden();
    await expect(field).toHaveValue('start');
    expect(await page.locator('.aurebesh-toolbar').first().evaluate((el) => (el as HTMLElement).inert)).toBe(true);

    await field.fill('# Heading\n\nSome **bold** and a list:\n\n- one\n- two');
    await radio(page, 'editor').click();
    await expect(content(page)).toBeVisible();
    await expect(field).toBeHidden();
    expect(await html(page)).toBe('<h1>Heading</h1><p>Some <strong>bold</strong> and a list:</p><ul><li>one</li><li>two</li></ul>');
    expect(await page.locator('.aurebesh-toolbar').first().evaluate((el) => (el as HTMLElement).inert)).toBe(false);
    await expect(page.locator('.aurebesh-count')).toHaveText(/words/);
  });

  test('the HTML view shows the HTML and removes what is not safe from what is typed', async ({ page }) => {
    await start(page, '<p>Hello <em>there</em></p>');
    await radio(page, 'html').click();
    await expect(page.locator('.aurebesh-source')).toHaveValue('<p>Hello <em>there</em></p>');
    await page.locator('.aurebesh-source').fill('<p onclick="alert(1)">changed</p><script>alert(1)</script>');
    await radio(page, 'editor').click();
    expect(await html(page)).toBe('<p>changed</p>');
  });

  test('the HTML view is formatted: a block on each line, indented where blocks are in a block', async ({ page }) => {
    await start(page, '<h2>Title</h2><p>Some <strong>bold</strong> text</p><ul><li>one</li><li>two</li></ul><table><tbody><tr><td>a</td></tr></tbody></table>');
    await radio(page, 'html').click();
    await expect(page.locator('.aurebesh-source')).toHaveValue(
      [
        '<h2>Title</h2>',
        '<p>Some <strong>bold</strong> text</p>',
        '<ul>',
        '  <li>one</li>',
        '  <li>two</li>',
        '</ul>',
        '<table>',
        '  <tbody>',
        '    <tr>',
        '      <td>a</td>',
        '    </tr>',
        '  </tbody>',
        '</table>',
      ].join('\n'),
    );
  });

  test('the formatting does not end up in the content: not when the view is left, and not when HTML is typed with line breaks', async ({ page }) => {
    const initial = '<h2>Title</h2><ul><li>one</li><li>two<ul><li>in</li></ul></li></ul><pre>a\n  b</pre><p>x</p>';
    await start(page, initial);
    await radio(page, 'html').click();
    const field = page.locator('.aurebesh-source');
    const shown = await field.inputValue();
    expect(shown).toContain('\n');
    // nothing was typed: the content is as it was
    await radio(page, 'editor').click();
    expect(await html(page)).toBe(initial);
    // typed with line breaks and an uneven indent
    await radio(page, 'html').click();
    await field.fill('\n<h2>Title</h2>\n\n  <ul>\n   <li>one</li>\n\t<li>two</li>\n  </ul>\n<p>y</p>\n');
    await radio(page, 'editor').click();
    expect(await html(page)).toBe('<h2>Title</h2><ul><li>one</li><li>two</li></ul><p>y</p>');
    // and the view shows it formatted again
    await radio(page, 'html').click();
    expect(await field.inputValue()).toBe(['<h2>Title</h2>', '<ul>', '  <li>one</li>', '  <li>two</li>', '</ul>', '<p>y</p>'].join('\n'));
  });

  test('the arrow keys move between the views, and the form gets the value of the editor', async ({ page }) => {
    await start(page, '<p>x</p>');
    await radio(page, 'editor').focus();
    await page.keyboard.press('ArrowRight');
    await expect(radio(page, 'html')).toHaveAttribute('aria-checked', 'true');
    await expect(radio(page, 'html')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(radio(page, 'markdown')).toHaveAttribute('aria-checked', 'true');
    await page.locator('.aurebesh-source').fill('typed in markdown');
    await page.locator('.aurebesh-source').blur();
    expect(await page.evaluate(() => (window as any).ed.value)).toBe('<p>typed in markdown</p>');
  });

  test('with a maximum height the view keeps to it and scrolls', async ({ page }) => {
    await start(page, Array.from({ length: 40 }, (_, i) => `<p>line ${i}</p>`).join(''));
    await page.evaluate(() => (document.querySelector('.aurebesh') as HTMLElement).style.setProperty('--aurebesh-max-height', '240px'));
    await radio(page, 'markdown').click();
    const field = page.locator('.aurebesh-source');
    expect((await field.boundingBox())!.height).toBeLessThanOrEqual(241);
    expect(await field.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  });

  test('works with the sidebar open, and the footer of a right-to-left editor mirrors', async ({ page }) => {
    await start(page, '<p>x</p>', JSON.stringify({ toolbar: ['bold', 'layout'], dir: 'rtl' }));
    const count = (await page.locator('.aurebesh-count').boundingBox())!;
    const modes = (await page.locator('.aurebesh-modes').boundingBox())!;
    expect(count.x).toBeGreaterThan(modes.x); // the numbers are at the start, which is the right
  });
});
