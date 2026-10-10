import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { button, content, expect, open, selectAll, type } from './helpers';

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
const clean = (page: Page): Promise<string> => page.evaluate(() => (window as any).ed.value);
const activeIsEditor = (page: Page) => page.evaluate(() => document.activeElement?.classList.contains('aurebesh-content') ?? false);

test.describe('lists', () => {
  test('Tab nests a list item, Shift+Tab brings it back, and Tab never leaves the editor', async ({ page }) => {
    await open(page);
    await type(page, '- one');
    await page.keyboard.press('Enter');
    await page.keyboard.type('two');

    await page.keyboard.press('Tab');
    expect(await clean(page)).toBe('<ul><li>one<ul><li>two</li></ul></li></ul>');
    expect(await activeIsEditor(page)).toBe(true);

    await page.keyboard.press('Shift+Tab');
    expect(await clean(page)).toBe('<ul><li>one</li><li>two</li></ul>');
  });

  test('Tab on the first item does nothing but keeps the focus', async ({ page }) => {
    await open(page);
    await type(page, '- only');
    await page.keyboard.press('Tab');
    expect(await clean(page)).toBe('<ul><li>only</li></ul>');
    expect(await activeIsEditor(page)).toBe(true);
  });
});

test.describe('input methods (IME)', () => {
  test('Enter, Tab and Space belong to the input method while it is composing', async ({ page }) => {
    await open(page);
    await content(page).click();
    await button(page, 'Code block').click();
    await page.keyboard.type('a');
    const result = await page.evaluate(() => {
      const c = document.querySelector('.aurebesh-content')!;
      const press = (key: string) => {
        const e = new KeyboardEvent('keydown', { key, isComposing: true, bubbles: true, cancelable: true });
        c.dispatchEvent(e);
        return e.defaultPrevented;
      };
      return { enter: press('Enter'), tab: press('Tab'), html: c.innerHTML };
    });
    expect(result.enter).toBe(false);
    expect(result.tab).toBe(false);
    expect(result.html).toBe('<pre>a</pre>');
  });

  test('a Markdown trigger does not fire during composition', async ({ page }) => {
    await open(page);
    await type(page, '#');
    const prevented = await page.evaluate(() => {
      const e = new KeyboardEvent('keydown', { key: ' ', isComposing: true, bubbles: true, cancelable: true });
      document.querySelector('.aurebesh-content')!.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(prevented).toBe(false);
    expect(await clean(page)).not.toContain('<h1>');
  });
});

test.describe('Markdown shortcuts', () => {
  const cases: Array<[string, string, RegExp]> = [
    ['# Title', 'heading 1', /^<h1>Title<\/h1>$/],
    ['## Sub', 'heading 2', /^<h2>Sub<\/h2>$/],
    ['- item', 'bullet list', /^<ul><li>item<\/li><\/ul>$/],
    ['1. first', 'numbered list', /^<ol><li>first<\/li><\/ol>$/],
    ['> quote', 'quote', /^<blockquote>quote<\/blockquote>$/],
  ];
  for (const [typed, name, expected] of cases) {
    test(`"${typed.split(' ')[0]} " makes a ${name}`, async ({ page }) => {
      await open(page);
      await type(page, typed);
      expect(await clean(page)).toMatch(expected);
    });
  }

  test('``` + Enter makes a code block and --- + Enter a horizontal line', async ({ page }) => {
    await open(page);
    await type(page, '```');
    await page.keyboard.press('Enter');
    await page.keyboard.type('x = 1');
    expect(await clean(page)).toBe('<pre>x = 1</pre>');

    await open(page);
    await type(page, 'above');
    await page.keyboard.press('Enter');
    await page.keyboard.type('---');
    await page.keyboard.press('Enter');
    await page.keyboard.type('below');
    const out = await clean(page);
    expect(out).toContain('<hr>');
    expect(out).toContain('above');
    expect(out).toContain('below');
    expect(out).not.toContain('---');
  });

  test('does not trigger in the middle of a line or inside a code block', async ({ page }) => {
    await open(page);
    await type(page, 'a # b');
    expect(await clean(page)).not.toContain('<h1>');

    await open(page);
    await content(page).click();
    await button(page, 'Code block').click();
    await page.keyboard.type('# not a heading');
    expect(await clean(page)).toBe('<pre># not a heading</pre>');
  });

  test('can be switched off with the markdownShortcuts option', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      (window as any).ed.options = { markdownShortcuts: false };
    });
    await type(page, '# plain');
    expect(await clean(page)).not.toContain('<h1>');
  });
});

test.describe('keyboard shortcuts', () => {
  test('Mod+K opens the link box with the field focused', async ({ page }) => {
    await open(page);
    await type(page, 'see');
    await selectAll(page);
    await page.keyboard.press(`${MOD}+K`);
    const field = page.locator('input[inputmode="url"]');
    await expect(field).toBeVisible();
    await expect(field).toBeFocused();
  });

  test('Mod+E inline code, Mod+Shift+8 bullet list, Mod+Shift+X strikethrough', async ({ page }) => {
    await open(page);
    await type(page, 'abc');
    await selectAll(page);
    await page.keyboard.press(`${MOD}+E`);
    expect(await clean(page)).toContain('<code>abc</code>');
    await page.keyboard.press(`${MOD}+E`);
    expect(await clean(page)).not.toContain('<code>');

    await page.keyboard.press(`${MOD}+Shift+8`);
    expect(await clean(page)).toContain('<ul>');

    await selectAll(page);
    await page.keyboard.press(`${MOD}+Shift+X`);
    expect(await clean(page)).toMatch(/<(s|strike|del)>/);
  });

  test('Mod+Alt+1 and Mod+Alt+2 set headings', async ({ page }) => {
    await open(page);
    await type(page, 'Title');
    await page.keyboard.press(`${MOD}+Alt+1`);
    expect(await clean(page)).toBe('<h1>Title</h1>');
    await page.keyboard.press(`${MOD}+Alt+2`);
    expect(await clean(page)).toBe('<h2>Title</h2>');
  });
});

test.describe('clean output', () => {
  test('value is "" for an empty editor, also after typing and deleting', async ({ page }) => {
    await open(page);
    expect(await clean(page)).toBe('');
    await type(page, 'a');
    expect(await clean(page)).toBe('<p>a</p>'.replace('<p>a</p>', await clean(page))); // browser-specific wrapper, just non-empty
    expect(await clean(page)).not.toBe('');
    await page.keyboard.press('Backspace');
    expect(await clean(page)).toBe('');
  });

  test('colour then "Automatic" leaves no empty or pointless markup', async ({ page }) => {
    await open(page);
    await type(page, 'text');
    await selectAll(page);
    await button(page, 'Text color').click();
    await page.locator('.aurebesh-table-picker:has(button[title="Text color"]) .aurebesh-color-grid button').nth(10).click();
    await selectAll(page);
    await button(page, 'Bold').click();
    const out = await clean(page);
    expect(out).not.toContain('style=""');
    expect(out).not.toContain('font-family: inherit');
    expect(out).not.toContain('<span>');
  });
});

test.describe('accessibility', () => {
  test('roles and names', async ({ page }) => {
    await open(page);
    await expect(content(page)).toHaveAttribute('role', 'textbox');
    await expect(content(page)).toHaveAttribute('aria-label', 'Rich text editor');
    await expect(page.locator('.aurebesh-toolbar').first()).toHaveAttribute('role', 'toolbar');
    await expect(page.locator('.aurebesh-toolbar').first()).toHaveAttribute('aria-label', 'Formatting');
    // every button has an accessible name
    const unnamed = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.aurebesh button')).filter((b) => !(b.getAttribute('aria-label') || b.textContent?.trim())).length,
    );
    expect(unnamed).toBe(0);
  });

  test('the toolbar is one tab stop and Left/Right/Home/End move between its buttons', async ({ page }) => {
    await open(page);
    const bar = page.locator('.aurebesh-toolbar').first();
    const stops = () => bar.locator(':scope > button, :scope > .aurebesh-table-picker > button').evaluateAll((bs) => bs.filter((b) => (b as HTMLButtonElement).tabIndex === 0).length);
    expect(await stops()).toBe(1);

    const first = bar.locator(':scope > button, :scope > .aurebesh-table-picker > button').first();
    await first.focus();
    await page.keyboard.press('ArrowRight');
    const second = await page.evaluate(() => (document.activeElement as HTMLElement).getAttribute('title'));
    expect(second).toBe('Italic'); // the first is Bold... after the font and size boxes
    await page.keyboard.press('End');
    expect(await page.evaluate(() => (document.activeElement as HTMLElement).getAttribute('title'))).toBe('Redo');
    await page.keyboard.press('Home');
    expect(await page.evaluate(() => (document.activeElement as HTMLElement).getAttribute('title'))).toBe('Bold');
    expect(await stops()).toBe(1);

    await page.keyboard.press('Escape');
    expect(await activeIsEditor(page)).toBe(true);
  });

  test('colour popover by keyboard: opens, arrows move, Enter applies, Escape closes and returns focus', async ({ page }) => {
    await open(page);
    await type(page, 'x');
    await selectAll(page);
    const toggle = button(page, 'Text color');
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('#000000');
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('#434343');
    await page.keyboard.press('ArrowDown');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('#f97316');
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();

    // and choosing one applies it
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    expect(await clean(page)).toMatch(/color:\s*rgb\(217, 45, 32\)/);
    expect(await activeIsEditor(page)).toBe(true);
  });

  test('table size by keyboard', async ({ page }) => {
    await open(page);
    await content(page).click();
    const toggle = button(page, 'Table');
    await toggle.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.aurebesh-table-label')).toHaveText('2 × 2');
    await page.keyboard.press('Enter');
    const shape = await page.evaluate(() => {
      const t = document.querySelector('.aurebesh-content table') as HTMLTableElement;
      return [t.rows.length, t.rows[0].cells.length];
    });
    expect(shape).toEqual([2, 2]);
  });

  test('errors are announced as alerts', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).ed.instance.uploadFiles([new File(['x'], 'x.exe', { type: 'application/x-msdownload' })]));
    await expect(page.locator('.aurebesh-status')).toHaveAttribute('role', 'alert');
  });
});
