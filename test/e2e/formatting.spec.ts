import { test } from '@playwright/test';
import { button, content, expect, html, open, selectAll, type } from './helpers';

test.describe('formatting', () => {
  test('bold from the toolbar', async ({ page }) => {
    await open(page);
    await type(page, 'hello');
    await selectAll(page);
    await button(page, 'Bold').click();
    expect(await html(page)).toMatch(/<(b|strong)>hello<\/(b|strong)>/);
  });

  test('picking a colour does not turn later Bold into a style that the sanitizer would drop', async ({ page }) => {
    await open(page);
    await type(page, 'hello');
    await selectAll(page);
    await button(page, 'Text color').click();
    await page.locator('.aurebesh-table-picker:has(button[title="Text color"]) .aurebesh-color-grid button').nth(10).click();
    await selectAll(page);
    await button(page, 'Bold').click();
    const out = await html(page);
    expect(out).toContain('color:');
    expect(out).not.toContain('font-weight');
    expect(out).toMatch(/<(b|strong)[ >]/);
  });

  test('text size is applied and survives a reload through the sanitizer', async ({ page }) => {
    await open(page);
    await type(page, 'big');
    await selectAll(page);
    await page.locator('select.aurebesh-size').selectOption('5');
    expect(await html(page)).toMatch(/font-size:\s*[\w-]*large/);
    await page.evaluate(() => {
      const ed = (window as any).ed;
      ed.instance.setHTML(ed.value);
    });
    expect(await html(page)).toMatch(/font-size:\s*[\w-]*large/);
  });

  test('alignment is applied and survives a reload through the sanitizer', async ({ page }) => {
    await open(page);
    await type(page, 'middle');
    await button(page, 'Align center').click();
    expect(await html(page)).toMatch(/text-align:\s*center/);
    await page.evaluate(() => {
      const ed = (window as any).ed;
      ed.instance.setHTML(ed.value);
    });
    expect(await html(page)).toMatch(/text-align:\s*center/);
  });

  test('inline code wraps the selection and unwraps again', async ({ page }) => {
    await open(page);
    await type(page, 'run it');
    await selectAll(page);
    await button(page, 'Inline code').click();
    expect(await html(page)).toContain('<code>run it</code>');
    await content(page).locator('code').click();
    await button(page, 'Inline code').click();
    expect(await html(page)).not.toContain('<code>');
  });

  test('link popover: add a link to selected text, then edit its prefilled address and remove it', async ({ page }) => {
    await open(page);
    await type(page, 'see');
    await selectAll(page);
    await button(page, 'Link').click();
    const field = page.locator('input[inputmode="url"]');
    await field.fill('example.com');
    await field.press('Enter');
    expect(await html(page)).toContain('<a href="https://example.com">see</a>');

    await content(page).locator('a').click();
    await button(page, 'Link').click();
    await expect(field).toHaveValue('https://example.com');
    await page.getByRole('button', { name: 'Remove link' }).click();
    expect(await html(page)).not.toContain('<a');
  });

  test('link popover refuses unsafe addresses and shows why', async ({ page }) => {
    await open(page);
    await type(page, 'x');
    await selectAll(page);
    await button(page, 'Link').click();
    const field = page.locator('input[inputmode="url"]');
    await field.fill('javascript:alert(1)');
    await field.press('Enter');
    expect(await html(page)).not.toContain('<a');
    await expect(page.locator('.aurebesh-status.error')).toBeVisible();
  });

  test('the "Font" and "Size" titles are shown while nothing is chosen but cannot be picked as an option', async ({ page }) => {
    await open(page);
    for (const sel of ['select.aurebesh-font', 'select.aurebesh-size']) {
      const select = page.locator(sel);
      await expect(select).toHaveValue('');
      const placeholder = select.locator('option[value=""]');
      await expect(placeholder).toBeDisabled();
      await expect(placeholder).toHaveAttribute('hidden', '');
      // it is what the closed select displays
      expect(await select.evaluate((s: HTMLSelectElement) => s.selectedOptions[0].textContent)).toMatch(/Font|Size/);
    }
    // choosing a real value works
    await type(page, 'x');
    await selectAll(page);
    await page.locator('select.aurebesh-size').selectOption('5');
    await page.locator('select.aurebesh-font').selectOption({ index: 2 });
    expect(await html(page)).toContain('font-family');
  });

  test('the size box shows the size of the selected text', async ({ page }) => {
    await open(page, '<h1>Heading</h1><p>plain <span style="font-size: x-large">big</span> and <span style="font-size: small">small</span></p>');
    const size = page.locator('select.aurebesh-size');
    const placeAndSelect = (text: string) =>
      page.evaluate((t) => {
        const c = document.querySelector('.aurebesh-content')!;
        const walker = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const i = n.textContent!.indexOf(t);
          if (i >= 0) {
            (c as HTMLElement).focus();
            const r = document.createRange();
            r.setStart(n, i);
            r.setEnd(n, i + t.length);
            const s = getSelection()!;
            s.removeAllRanges();
            s.addRange(r);
            return;
          }
        }
      }, text);

    await placeAndSelect('big');
    await expect(size).toHaveValue('5');
    await placeAndSelect('small');
    await expect(size).toHaveValue('2');
    await placeAndSelect('plain');
    await expect(size).toHaveValue('3');
    await placeAndSelect('Heading');
    await expect(size).toHaveValue(''); // headings have their own size: back to the title

    // after choosing a size the box keeps showing it
    await placeAndSelect('plain');
    await size.selectOption('6');
    await expect(size).toHaveValue('6');
    expect(await html(page)).toMatch(/font-size:\s*xx-large/);
  });

  test('the size box also recognises other markup, and selections that start just before the sized text', async ({ page }) => {
    await open(page);
    // Raw DOM on purpose: the sanitizer would strip <font> and em sizes, but a browser can produce them in the live editor.
    await page.evaluate(() => {
      document.querySelector('.aurebesh-content')!.innerHTML =
        '<p>plain <font size="5">legacy</font> <span style="font-size: 1.5em">em</span> <span style="font-size: x-large">drag</span> tail</p>';
    });
    const size = page.locator('select.aurebesh-size');
    const select = (from: string, to: string, fromEnd = false) =>
      page.evaluate(
        ([a, b, atEnd]) => {
          const c = document.querySelector('.aurebesh-content') as HTMLElement;
          c.focus();
          const find = (t: string) => {
            const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
            for (let n = w.nextNode(); n; n = w.nextNode()) if (n.textContent!.includes(t)) return n;
            throw new Error(`no text ${t}`);
          };
          const na = find(a as string);
          const nb = find(b as string);
          const r = document.createRange();
          // start at the very END of the text node before the target, like a drag that began just before it
          r.setStart(na, atEnd ? na.textContent!.length : na.textContent!.indexOf(a as string));
          r.setEnd(nb, nb.textContent!.indexOf(b as string) + (b as string).length);
          const s = getSelection()!;
          s.removeAllRanges();
          s.addRange(r);
        },
        [from, to, fromEnd] as const,
      );

    await select('legacy', 'legacy');
    await expect(size).toHaveValue('5'); // <font size="5">
    await select('em', 'em');
    await expect(size).toHaveValue('5'); // 1.5em
    await select('plain ', 'drag', true); // starts at the end of "plain " and runs over the sized words
    await expect(size).toHaveValue('5');
  });

  test.describe('opening links', () => {
    const LINKED = '<p>see <a href="https://example.com/page">the link</a> here</p>';
    const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

    test.beforeEach(async ({ page }) => {
      // The pages the tests open: no network needed.
      await page.context().route('https://example.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<title>opened</title>' }));
    });

    test('a row with the address and Open / Edit / Remove shows while the caret is in a link, and hides outside it', async ({ page }) => {
      await open(page, LINKED);
      const row = page.locator('.aurebesh-link-tools');
      await expect(row).toBeHidden();
      await content(page).locator('a').click();
      await expect(row).toBeVisible();
      await expect(row.locator('.aurebesh-link-url')).toHaveText('https://example.com/page');
      for (const name of ['Open link', 'Edit', 'Remove link']) await expect(row.getByRole('button', { name })).toBeVisible();
      await content(page).locator('p').click({ position: { x: 3, y: 5 } }); // before the link
      await expect(row).toBeHidden();
    });

    test('Open link opens the address in a new tab that cannot reach back to the editor', async ({ page }) => {
      await open(page, LINKED);
      await content(page).locator('a').click();
      const popupPromise = page.waitForEvent('popup');
      await page.locator('.aurebesh-link-tools').getByRole('button', { name: 'Open link' }).click();
      const popup = await popupPromise;
      await popup.waitForLoadState();
      expect(popup.url()).toBe('https://example.com/page');
      expect(await popup.evaluate(() => window.opener)).toBeNull(); // noopener
    });

    test('Edit opens the link box with the address filled in, and Remove takes the link away', async ({ page }) => {
      await open(page, LINKED);
      await content(page).locator('a').click();
      await page.locator('.aurebesh-link-tools').getByRole('button', { name: 'Edit' }).click();
      await expect(page.locator('input[inputmode="url"]')).toHaveValue('https://example.com/page');
      await page.keyboard.press('Escape');

      await content(page).locator('a').click();
      await page.locator('.aurebesh-link-tools').getByRole('button', { name: 'Remove link' }).click();
      expect(await html(page)).not.toContain('<a');
      await expect(page.locator('.aurebesh-link-tools')).toBeHidden();
    });

    test('Ctrl/Cmd+click opens a link while editing; a plain click only places the caret', async ({ page }) => {
      await open(page, LINKED);
      let opened = 0;
      page.on('popup', () => opened++);
      await content(page).locator('a').click();
      await page.waitForTimeout(250);
      expect(opened).toBe(0);
      const popupPromise = page.waitForEvent('popup');
      await content(page).locator('a').click({ modifiers: [MOD] });
      expect((await popupPromise).url()).toBe('https://example.com/page');
      expect(opened).toBe(1);
    });

    test('in a read-only editor a plain click opens the link', async ({ page }) => {
      await open(page, LINKED);
      await page.evaluate(() => (window as any).ed.setAttribute('readonly', ''));
      const popupPromise = page.waitForEvent('popup');
      await content(page).locator('a').click();
      expect((await popupPromise).url()).toBe('https://example.com/page');
    });

    test('an address that is not safe (a script) is never opened, and its Open button is off', async ({ page }) => {
      await open(page);
      // Raw DOM on purpose: the sanitizer would remove such an href, but it must not be run if one is ever there.
      await page.evaluate(() => {
        (window as any).ran = false;
        document.querySelector('.aurebesh-content')!.innerHTML = '<p>x <a href="javascript:window.ran=true">bad</a></p>';
      });
      let opened = 0;
      page.on('popup', () => opened++);
      await content(page).locator('a').click({ modifiers: [MOD] });
      await page.waitForTimeout(250);
      expect(opened).toBe(0);
      expect(await page.evaluate(() => (window as any).ran)).toBe(false);
      await content(page).locator('a').click();
      await expect(page.locator('.aurebesh-link-tools').getByRole('button', { name: 'Open link' })).toBeDisabled();
    });

    test('the row can be translated with the labels option', async ({ page }) => {
      await open(page, LINKED);
      await page.evaluate(() => {
        (window as any).ed.options = { labels: { 'ui.openLink': 'Link openen', 'ui.editLink': 'Bewerken' } };
      });
      await content(page).locator('a').click();
      await expect(page.locator('.aurebesh-link-tools').getByRole('button', { name: 'Link openen' })).toBeVisible();
      await expect(page.locator('.aurebesh-link-tools').getByRole('button', { name: 'Bewerken' })).toBeVisible();
    });
  });

  test('horizontal line and lists', async ({ page }) => {
    await open(page);
    await type(page, 'one');
    await button(page, 'Bullet list').click();
    expect(await html(page)).toContain('<ul>');
    await button(page, 'Horizontal line').click();
    expect(await html(page)).toContain('<hr');
  });
});
