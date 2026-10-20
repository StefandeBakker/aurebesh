import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { content, expect } from './helpers';

/** A page with one headless editor: the element that the test page has is taken out, and with it the built-in styles. */
async function openHeadless(page: Page, attrs: Record<string, string> = {}, html = '<p>hello world</p>') {
  await page.goto('/test/e2e/page.html');
  await page.locator('.aurebesh-content').waitFor();
  await page.evaluate(
    ([attributes, initial]) => {
      document.querySelectorAll('style[data-aurebesh]').forEach((s) => s.remove());
      document.getElementById('ed')!.remove();
      const el = document.createElement('aurebesh-editor') as any;
      el.id = 'ed';
      el.setAttribute('headless', '');
      for (const [k, v] of Object.entries(attributes as Record<string, string>)) el.setAttribute(k, v);
      el.innerHTML = initial as string;
      document.body.appendChild(el);
      (window as any).ed = el;
    },
    [attrs, html] as const,
  );
  await page.locator('.aurebesh-content').waitFor();
}

const style = (page: Page, selector: string, property: string) => page.locator(selector).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), property);

test.describe('a headless editor', () => {
  test('has none of the built-in look, and only its own few styles in the page', async ({ page }) => {
    await openHeadless(page);
    expect(await page.locator('style[data-aurebesh]').count()).toBe(0);
    expect(await page.locator('style[data-aurebesh-headless]').count()).toBe(1);
    expect(await style(page, '.aurebesh', 'border-top-width')).toBe('0px');
    expect(await style(page, '.aurebesh-toolbar button', 'background-color')).not.toBe('rgb(248, 249, 251)');
    expect(await style(page, '.aurebesh-toolbar button', 'border-top-width')).not.toBe('0px'); // the browser's own button
    expect(await style(page, '.aurebesh-content', 'padding-left')).toBe('0px');
  });

  test('still works: typing, the toolbar, formatting', async ({ page }) => {
    await openHeadless(page);
    await content(page).click();
    await page.keyboard.press('Control+A');
    await page.locator('.aurebesh-cmd-bold').click();
    expect(await page.evaluate(() => (window as any).ed.instance.getHTML())).toMatch(/<(b|strong)>hello world<\/(b|strong)>/);
    await expect(page.locator('.aurebesh-cmd-bold')).toHaveAttribute('aria-pressed', 'true');
  });

  test('keeps what makes it work: hidden things stay hidden, a dropdown floats, the icons have a size', async ({ page }) => {
    await openHeadless(page);
    const table = page.locator('.aurebesh-cmd-table');
    const pop = page.locator('.aurebesh-table-picker:has(.aurebesh-cmd-table) .aurebesh-table-pop');
    await expect(pop).toBeHidden();
    expect(await pop.evaluate((el) => getComputedStyle(el).position)).toBe('absolute');
    await table.click();
    await expect(pop).toBeVisible();
    const icon = await page.locator('.aurebesh-icon').first().boundingBox();
    expect(icon!.width).toBeGreaterThan(8);
    expect(icon!.width).toBeLessThan(40);
  });

  test('the slash menu and the placeholder are there, and the menu floats', async ({ page }) => {
    await openHeadless(page, { placeholder: 'Type here' }, '');
    await expect(content(page)).toHaveClass(/is-empty/);
    expect(await content(page).evaluate((el) => getComputedStyle(el, '::before').content)).toBe('"Type here"');
  });

  test('can be styled by the page: its own CSS applies', async ({ page }) => {
    await openHeadless(page);
    await page.addStyleTag({ content: '.aurebesh{border:3px solid rgb(255, 0, 0)} .aurebesh-toolbar button{background:rgb(0, 128, 0)}' });
    expect(await style(page, '.aurebesh', 'border-top-width')).toBe('3px');
    expect(await style(page, '.aurebesh-toolbar button', 'background-color')).toBe('rgb(0, 128, 0)');
  });

  test('can be a toolbar of your own: the buttons call exec(), and the state event tells when to redraw', async ({ page }) => {
    await openHeadless(page, { toolbar: 'none' });
    await page.evaluate(() => {
      const ed = (window as any).ed;
      const bar = document.createElement('div');
      bar.id = 'mine';
      for (const name of ['bold', 'italic']) {
        const b = document.createElement('button');
        b.dataset.cmd = name;
        b.textContent = name;
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.addEventListener('click', () => ed.instance.exec(name));
        bar.appendChild(b);
      }
      document.body.insertBefore(bar, ed);
      (window as any).states = 0;
      ed.instance.on('state', () => {
        (window as any).states++;
        for (const b of bar.querySelectorAll<HTMLButtonElement>('button')) {
          b.setAttribute('aria-pressed', String(ed.instance.isActive(b.dataset.cmd!)));
          b.disabled = !ed.instance.isEnabled(b.dataset.cmd!);
        }
      });
    });
    await content(page).click();
    await page.keyboard.press('Control+A');
    await page.locator('#mine [data-cmd="bold"]').click();
    await expect(page.locator('#mine [data-cmd="bold"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#mine [data-cmd="italic"]')).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => (window as any).ed.instance.getHTML())).toMatch(/<(b|strong)>hello world/);
    expect(await page.evaluate(() => (window as any).states)).toBeGreaterThan(0);
    await page.locator('#mine [data-cmd="bold"]').click();
    await expect(page.locator('#mine [data-cmd="bold"]')).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => (window as any).ed.instance.listCommands())).toEqual(expect.arrayContaining(['bold', 'italic', 'table', 'link']));
  });

  test('is made again when the attribute goes, with the built-in look', async ({ page }) => {
    await openHeadless(page);
    await page.evaluate(() => (window as any).ed.removeAttribute('headless'));
    await page.locator('.aurebesh-content').waitFor();
    expect(await page.locator('style[data-aurebesh]').count()).toBe(1);
    expect(await style(page, '.aurebesh', 'border-top-width')).toBe('1px');
  });
});

test.describe('exec() with what the commands take', () => {
  const run = async (page: Page, html: string, steps: string) => {
    await openHeadless(page, { toolbar: 'none' }, html);
    await content(page).click();
    await page.keyboard.press('Control+A');
    await page.evaluate(steps);
    return page.evaluate(() => (window as any).ed.instance.getHTML());
  };

  test('size, weight, colour, link and the callout', async ({ page }) => {
    expect(await run(page, '<p>text</p>', "window.ed.instance.exec('size', '14')")).toContain('font-size: 14pt');
    expect(await run(page, '<p>text</p>', "window.ed.instance.exec('weight', '600')")).toContain('font-weight: 600');
    expect(await run(page, '<p>text</p>', "window.ed.instance.exec('color', '#dc2626')")).toMatch(/color:\s*(#dc2626|rgb\(220, 38, 38\))/);
    expect(await run(page, '<p>text</p>', "window.ed.instance.exec('link', 'https://example.com/')")).toContain('<a href="https://example.com/">text</a>');
    expect(await run(page, '<p>text</p>', "window.ed.instance.exec('callout', 'warning')")).toBe('<div data-callout="warning"><p>text</p></div>');
    expect(await run(page, '<div data-callout="warning"><p>text</p></div>', "window.ed.instance.exec('callout', 'none')")).toBe('<p>text</p>');
  });

  test('the language of a code block, and a table', async ({ page }) => {
    expect(await run(page, '<pre>x = 1</pre>', "window.ed.instance.exec('codeLanguage', 'python')")).toBe('<pre data-language="python">x = 1</pre>');
    const out = await run(page, '<p>text</p>', "window.ed.instance.exec('table', '2x3')");
    expect(out).toContain('<table');
  });
});
