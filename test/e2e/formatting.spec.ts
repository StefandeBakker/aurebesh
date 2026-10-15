import { test } from '@playwright/test';
import { button, content, expect, html, open, selectAll, setHtml, type } from './helpers';

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

    test('the row is a popover on the link: above it, and beside it when the link is on the first line', async ({ page }) => {
      await open(page, '<p>x</p><p>y</p><p>see <a href="https://example.com/page">the link</a> here</p>');
      const pop = page.locator('.aurebesh-link-tools');
      const box = async (l: ReturnType<typeof page.locator>) => (await l.boundingBox())!;
      await content(page).locator('a').click();
      await expect(pop).toBeVisible();
      let p = await box(pop);
      let a = await box(content(page).locator('a'));
      expect(p.y + p.height).toBeLessThanOrEqual(a.y); // above the link
      expect(Math.abs(p.x - a.x)).toBeLessThan(2);
      expect(await pop.evaluate((el) => (el as HTMLElement).dataset.place)).toBe('above');

      await open(page, '<p><a href="https://example.com/page">first line</a> and more</p>');
      await content(page).locator('a').click();
      await expect(pop).toBeVisible();
      p = await box(pop);
      a = await box(content(page).locator('a'));
      expect(p.x).toBeGreaterThanOrEqual(a.x + a.width); // beside it: there is no room above
      expect(await pop.evaluate((el) => (el as HTMLElement).dataset.place)).toBe('beside');
      const bar = await box(page.locator('.aurebesh-toolbar').first());
      expect(p.y).toBeGreaterThanOrEqual(bar.y + bar.height - 1); // never over the toolbar
    });

    test('the link box opens on the link (to edit) or at the caret (to add), not under the toolbar', async ({ page }) => {
      await open(page, '<p>x</p><p>y</p><p>z</p><p>w</p><p>see <a href="https://example.com/page">the link</a> here</p><p>plain words</p>');
      const form = page.locator('input[inputmode="url"]').locator('xpath=..');
      const box = async (l: ReturnType<typeof page.locator>) => (await l.boundingBox())!;
      await content(page).locator('a').click();
      await page.locator('.aurebesh-link-tools').getByRole('button', { name: 'Edit' }).click();
      await expect(form).toBeVisible();
      await expect(page.locator('.aurebesh-link-tools')).toBeHidden(); // it makes way for the box
      let f = await box(form);
      let a = await box(content(page).locator('a'));
      expect(f.y + f.height).toBeLessThanOrEqual(a.y);
      expect(Math.abs(f.x - a.x)).toBeLessThan(2);
      await page.keyboard.press('Escape');

      await content(page).locator('p').nth(5).click();
      await page.locator('button[title="Link"]').click();
      await expect(form).toBeVisible();
      f = await box(form);
      const p = await box(content(page).locator('p').nth(5));
      expect(f.y + f.height).toBeLessThanOrEqual(p.y + 1); // above the line the caret is on
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

test.describe('the colour buttons', () => {
  const rgb = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
  };
  const fill = (page: any, title: string) => page.locator(`button[title="${title}"] .aurebesh-icon-swatch`).evaluate((e: Element) => getComputedStyle(e).fill);
  const palette = (page: any, title: string) => page.locator(`.aurebesh-table-picker:has(button[title="${title}"])`);

  test('are an icon with a bar: the text colour is black to begin with, the highlight yellow', async ({ page }) => {
    await open(page);
    expect(await fill(page, 'Text color')).toBe('rgb(17, 17, 17)');
    expect(await fill(page, 'Highlight color')).toBe('rgb(250, 204, 21)');
  });

  test('have a small arrow that says a palette opens', async ({ page }) => {
    await open(page);
    for (const t of ['Text color', 'Highlight color']) {
      const arrow = await button(page, t).evaluate((b) => getComputedStyle(b, '::after').content);
      expect(arrow, t).not.toBe('none');
    }
    await expect(button(page, 'Bold')).toBeVisible();
    expect(await button(page, 'Bold').evaluate((b) => getComputedStyle(b, '::after').content)).toBe('none'); // other buttons have none
  });

  test('show the colour chosen last in the bar, and go back to the default on reset', async ({ page }) => {
    await open(page);
    await type(page, 'x');
    for (const [title, dflt] of [['Text color', 'rgb(17, 17, 17)'], ['Highlight color', 'rgb(250, 204, 21)']] as const) {
      await selectAll(page);
      await button(page, title).click();
      const swatch = palette(page, title).locator('.aurebesh-color-grid button').nth(12);
      const color = (await swatch.getAttribute('aria-label'))!;
      await swatch.click();
      expect(await fill(page, title), title).toBe(rgb(color));
      await selectAll(page);
      await button(page, title).click();
      await palette(page, title).locator('.aurebesh-color-reset').click();
      expect(await fill(page, title), title).toBe(dflt);
    }
  });

  test('a light colour is still visible: the bar has an outline', async ({ page }) => {
    await open(page);
    await type(page, 'x');
    await selectAll(page);
    await button(page, 'Highlight color').click();
    await palette(page, 'Highlight color').locator('.aurebesh-color-grid button').first().click();
    const stroke = await page.locator('button[title="Highlight color"] .aurebesh-icon-swatch').evaluate((e) => getComputedStyle(e).stroke);
    expect(stroke).not.toBe('none');
  });

  test('still apply the colour to the text, and the HTML has it', async ({ page }) => {
    await open(page);
    await type(page, 'hello');
    await selectAll(page);
    await button(page, 'Highlight color').click();
    await palette(page, 'Highlight color').locator('.aurebesh-color-grid button').nth(12).click();
    expect(await html(page)).toMatch(/background-color:/);
  });
});

test.describe('the toolbar layout', () => {
  const box = (page: any, selector: string) => page.evaluate((s: string) => document.querySelector(s)!.getBoundingClientRect().toJSON(), selector);

  test('undo and redo are in a strip of their own above the toolbar, at the start', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 800 });
    await open(page);
    const strip = await box(page, '.aurebesh-quickbar');
    const bar = await box(page, '.aurebesh-toolbar:not(.aurebesh-quickbar)');
    const undo = await box(page, '.aurebesh-quickbar button[title="Undo"]');
    const redo = await box(page, '.aurebesh-quickbar button[title="Redo"]');
    expect(strip.bottom).toBeLessThanOrEqual(bar.top + 1); // above the toolbar, not beside it
    expect(Math.abs(strip.left - bar.left)).toBeLessThan(2);
    expect(undo.left - strip.left).toBeLessThan(8); // the first thing in the strip
    expect(redo.left).toBeGreaterThan(undo.left);
    expect(redo.right).toBeLessThan(strip.left + 80); // a small strip: the buttons are together, not spread
    expect(strip.height).toBeLessThan(bar.height); // and smaller than the toolbar
    expect(await button(page, 'Undo').evaluate((b) => b.closest('.aurebesh-quickbar') !== null)).toBe(true);
  });

  test('the strip keeps its place when the toolbar wraps onto more rows', async ({ page }) => {
    await page.setViewportSize({ width: 520, height: 800 });
    await open(page);
    const strip = await box(page, '.aurebesh-quickbar');
    const bar = await box(page, '.aurebesh-toolbar:not(.aurebesh-quickbar)');
    expect(bar.height).toBeGreaterThan(strip.height * 2); // the toolbar wrapped
    expect(strip.bottom).toBeLessThanOrEqual(bar.top + 1);
    expect(strip.height).toBeLessThan(40); // one row
  });

  test('in a right-to-left page the strip starts on the right', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 800 });
    await open(page);
    await page.evaluate(() => (document.documentElement.dir = 'rtl'));
    const strip = await box(page, '.aurebesh-quickbar');
    const undo = await box(page, '.aurebesh-quickbar button[title="Undo"]');
    expect(strip.right - undo.right).toBeLessThan(8);
  });

  test('Undo and Redo still work from the strip', async ({ page }) => {
    await open(page);
    await type(page, 'one');
    await selectAll(page);
    await button(page, 'Bold').click();
    expect(await html(page)).toMatch(/<(b|strong)>one<\/(b|strong)>/);
    await button(page, 'Undo').click();
    expect(await html(page)).not.toMatch(/<(b|strong)>/);
    await button(page, 'Redo').click();
    expect(await html(page)).toMatch(/<(b|strong)>one<\/(b|strong)>/);
  });

  test('your own toolbar has no strip, and with a quickbar option it does', async ({ page }) => {
    await open(page);
    await page.evaluate(() => ((window as any).ed.options = { toolbar: ['bold', 'italic', 'undo'] }));
    await expect(page.locator('.aurebesh-quickbar')).toHaveCount(0);
    await expect(page.locator('button[title="Undo"]')).toHaveCount(1);
    await page.evaluate(() => ((window as any).ed.options = { toolbar: ['bold'], quickbar: ['undo', 'redo'] }));
    await expect(page.locator('.aurebesh-quickbar button')).toHaveCount(2);
  });

  test('the element can say it with an attribute', async ({ page }) => {
    await open(page);
    await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<aurebesh-editor id="second" toolbar="bold,italic" quickbar="undo"></aurebesh-editor>'));
    const strip = page.locator('#second .aurebesh-quickbar button');
    await expect(strip).toHaveCount(1);
    await expect(strip).toHaveAttribute('title', 'Undo');
    await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<aurebesh-editor id="third" quickbar=""></aurebesh-editor>')); // an empty one: no strip at all
    await expect(page.locator('#third .aurebesh-toolbar[aria-label="Formatting"]')).toHaveCount(1); // the toolbar is still there
    await expect(page.locator('#third .aurebesh-quickbar')).toHaveCount(0);
  });

  const groups = (page: any) =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('.aurebesh-toolbar:not(.aurebesh-quickbar) > .aurebesh-group')).map((g) => {
        const r = g.getBoundingClientRect();
        const rows = Array.from(g.querySelectorAll(':scope > .aurebesh-row')).map((row) => row.getBoundingClientRect().toJSON());
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, rows };
      }),
    );

  test('the toolbar is blocks of two rows, side by side in one band when there is room', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 800 });
    await open(page);
    const g = await groups(page);
    expect(g).toHaveLength(5);
    expect(g.map((b: any) => b.rows.length)).toEqual([2, 2, 2, 2, 1]);
    // every block starts at the same height, and the toolbar is two rows high, not more
    for (const b of g) expect(Math.abs(b.top - g[0].top)).toBeLessThan(2);
    const bar = await page.evaluate(() => document.querySelector('.aurebesh-toolbar:not(.aurebesh-quickbar)')!.getBoundingClientRect().height);
    expect(bar).toBeLessThan(80);
    // in a block the second row is under the first
    for (const b of g.filter((x: any) => x.rows.length === 2)) expect(b.rows[1].top).toBeGreaterThanOrEqual(b.rows[0].bottom - 1);
  });

  test('a block is never cut in two: when it is narrow whole blocks go to the next line', async ({ page }) => {
    await page.setViewportSize({ width: 520, height: 800 });
    await open(page);
    const g = await groups(page);
    const tops = new Set(g.map((b: any) => Math.round(b.top)));
    expect(tops.size).toBeGreaterThan(1); // it wrapped
    for (const b of g) {
      expect(b.height).toBeLessThan(70); // no block is taller than its two rows
      expect(b.rows.length === 1 || b.rows[1].top >= b.rows[0].bottom - 1).toBe(true);
    }
    // blocks do not overlap each other
    for (let i = 0; i < g.length; i++)
      for (let j = i + 1; j < g.length; j++) {
        const sameLine = Math.abs(g[i].top - g[j].top) < 2;
        if (sameLine) expect(g[i].right <= g[j].left + 1 || g[j].right <= g[i].left + 1).toBe(true);
      }
  });

  test('a block is a labelled group for assistive technology, inside the toolbar', async ({ page }) => {
    await open(page);
    await expect(page.locator('.aurebesh-toolbar:not(.aurebesh-quickbar) > .aurebesh-group[role="group"]')).toHaveCount(5);
  });

  test('every button still works, from its place in a block', async ({ page }) => {
    await open(page);
    await type(page, 'hello');
    await selectAll(page);
    await button(page, 'Italic').click();
    await button(page, 'Align center').click();
    await button(page, 'Heading 2').click();
    const out = await html(page);
    expect(out).toMatch(/<h2[^>]*text-align:\s*center[^>]*>.*<(i|em)>hello<\/(i|em)>/);
  });

  test('your own toolbar of one row keeps working: each | is a block of one row', async ({ page }) => {
    await open(page);
    await page.evaluate(() => ((window as any).ed.options = { toolbar: ['bold', 'italic', '|', 'link', 'table'] }));
    const g = await groups(page);
    expect(g.map((b: any) => b.rows.length)).toEqual([1, 1]);
    await expect(button(page, 'Bold')).toBeVisible();
  });
});

test.describe('a fixed maximum height', () => {
  const LONG = Array.from({ length: 40 }, (_, i) => `<p>line ${i}</p>`).join('');

  test('the text scrolls inside the editor and the toolbar stays where it is', async ({ page }) => {
    await open(page, LONG);
    const free = (await page.locator('.aurebesh').boundingBox())!.height;
    await page.evaluate(() => (document.querySelector('.aurebesh') as HTMLElement).style.setProperty('--aurebesh-max-height', '200px'));
    const box = (await page.locator('.aurebesh').boundingBox())!;
    expect(box.height).toBeLessThan(free);
    expect(box.height).toBeLessThan(400); // the text area is 200px, plus the toolbar
    const bar = await page.locator('.aurebesh-toolbar').first().boundingBox();
    await content(page).evaluate((el) => (el.scrollTop = el.scrollHeight));
    expect(await content(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(await page.locator('.aurebesh-toolbar').first().boundingBox()).toEqual(bar); // not scrolled away
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('without it the editor grows with the text', async ({ page }) => {
    await open(page, LONG);
    expect((await page.locator('.aurebesh').boundingBox())!.height).toBeGreaterThan(600);
  });

  test('a link popover hangs on its link inside the scrolling text, and hides when the link scrolls out of view', async ({ page }) => {
    await open(page, '<p><a href="https://example.com/a">top link</a></p>' + LONG);
    await page.evaluate(() => (document.querySelector('.aurebesh') as HTMLElement).style.setProperty('--aurebesh-max-height', '200px'));
    await content(page).locator('a').click();
    const pop = page.locator('.aurebesh-link-tools');
    await expect(pop).toBeVisible();
    await content(page).evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect(pop).toBeHidden(); // visibility: hidden once the link is out of the visible text
  });
});

test('a wide block wraps inside a narrow toolbar instead of running out of it', async ({ page }) => {
  await open(page);
  await page.setViewportSize({ width: 360, height: 700 });
  const over = await page.evaluate(() => {
    const bar = document.querySelector('.aurebesh-toolbar:not(.aurebesh-quickbar)') as HTMLElement;
    return bar.scrollWidth - bar.clientWidth;
  });
  expect(over).toBeLessThanOrEqual(0);
});

test.describe('ribbon toolbar', () => {
  const RIBBON = ['#History', 'undo', 'redo', '|', '#Alinea', 'alignLeft', 'indent', 'outdent', '|', '#Lijsten', 'ul', '>', '#View', 'fullscreen'];
  const openRibbon = async (page: import('@playwright/test').Page, html: string) => {
    await open(page, html);
    await page.evaluate((toolbar) => {
      const w = window as any;
      w.ed.options = { toolbar };
    }, RIBBON);
    await page.locator('.aurebesh-ribbon').waitFor();
  };

  test('shows a tooltip with the name and the shortcut, and gives the browser title back', async ({ page }) => {
    await openRibbon(page, '<p>text</p>');
    const btn = page.locator('.aurebesh-cmd-undo');
    await btn.hover();
    const tip = page.locator('.aurebesh-tip');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText('Undo');
    await expect(tip.locator('kbd')).toHaveText(/Ctrl\+Z|⌘Z/);
    await page.mouse.move(5, 5);
    await expect(tip).toBeHidden();
    await expect(btn).toHaveAttribute('title', 'Undo');
  });

  test('indents a paragraph in steps and back, and a list item into a nested list', async ({ page }) => {
    await openRibbon(page, '<p>text</p>');
    await content(page).locator('p').click();
    await page.locator('.aurebesh-cmd-indent').click();
    await page.locator('.aurebesh-cmd-indent').click();
    expect(await html(page)).toBe('<p style="margin-inline-start: 48px;">text</p>');
    await page.locator('.aurebesh-cmd-outdent').click();
    await page.locator('.aurebesh-cmd-outdent').click();
    expect(await html(page)).toBe('<p>text</p>');
    await expect(page.locator('.aurebesh-cmd-outdent')).toBeDisabled();

    await setHtml(page, '<ul><li>one</li><li>two</li></ul>');
    await content(page).locator('li').nth(1).click();
    await page.locator('.aurebesh-cmd-indent').click();
    await expect(content(page).locator('ul ul li')).toHaveText('two'); // nested one level
  });

  test('full screen fills the window, keeps the toolbar, and Escape brings it back', async ({ page }) => {
    await openRibbon(page, '<p>text</p>');
    const root = page.locator('.aurebesh');
    const before = (await root.boundingBox())!;
    await page.locator('.aurebesh-cmd-fullscreen').click();
    const full = (await root.boundingBox())!;
    const view = page.viewportSize()!;
    expect(full.width).toBe(view.width);
    expect(full.height).toBe(view.height);
    await expect(page.locator('.aurebesh-cmd-fullscreen')).toHaveAttribute('aria-pressed', 'true');
    await content(page).click();
    await page.keyboard.press('Escape');
    expect((await root.boundingBox())!.height).toBe(before.height);
  });

  test('the block after > sits at the far end', async ({ page }) => {
    await openRibbon(page, '<p>text</p>');
    const bar = (await page.locator('.aurebesh-toolbar').first().boundingBox())!;
    const last = (await page.locator('.aurebesh-group-end').boundingBox())!;
    expect(bar.x + bar.width - (last.x + last.width)).toBeLessThan(40); // against the right edge (the padding of the toolbar)
  });
});

test.describe('layout panel', () => {
  const openPanel = async (page: import('@playwright/test').Page, html: string) => {
    await open(page, html);
    await page.evaluate(() => ((window as any).ed.options = { toolbar: ['bold', 'layout'] }));
    await page.locator('.aurebesh-cmd-layout').click();
    await expect(page.locator('.aurebesh-panel')).toBeVisible();
  };

  test('opens beside the text, and a tile puts the paragraph in that many columns', async ({ page }) => {
    await openPanel(page, '<p>one</p><p>two</p>');
    const text = (await page.locator('.aurebesh-stage').boundingBox())!;
    const panel = (await page.locator('.aurebesh-panel').boundingBox())!;
    expect(panel.x).toBeGreaterThanOrEqual(text.x + text.width - 1); // beside, not over
    await content(page).locator('p').first().click();
    await page.locator('.aurebesh-tile[data-columns="2"]').click();
    expect(await html(page)).toContain('column-count: 2');
    await expect(page.locator('.aurebesh-tile[data-columns="2"]')).toHaveAttribute('aria-checked', 'true');
    await page.locator('.aurebesh-tile[data-columns="1"]').click();
    expect(await html(page)).not.toContain('column-count');
    await expect(page.locator('.aurebesh-tile[data-columns="1"]')).toHaveAttribute('aria-checked', 'true');
  });

  test('the maximum text width centres the text, and the line spacing changes the lines', async ({ page }) => {
    await openPanel(page, '<p>one</p>');
    const field = page.locator('.aurebesh-panel .aurebesh-field', { hasText: 'Maximum text width' }).locator('input');
    await field.fill('400');
    await field.press('Tab');
    const width = await content(page).evaluate((el) => {
      const cs = getComputedStyle(el);
      return el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    });
    expect(Math.round(width)).toBeLessThanOrEqual(400);
    expect(Math.round(width)).toBeGreaterThan(380);
    await page.locator('.aurebesh-panel select').last().selectOption('2');
    expect(await content(page).evaluate((el) => getComputedStyle(el).lineHeight)).not.toBe('normal');
    expect(await html(page)).toBe('<p>one</p>'); // not in the HTML
  });

  test('Escape closes the panel and gives the focus back to its button', async ({ page }) => {
    await openPanel(page, '<p>one</p>');
    await page.locator('.aurebesh-tile').first().focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('.aurebesh-panel')).toBeHidden();
    await expect(page.locator('.aurebesh-cmd-layout')).toBeFocused();
    await expect(page.locator('.aurebesh-cmd-layout')).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('a sidebar taller than the maximum height', () => {
  const LONG = Array.from({ length: 6 }, (_, i) => `<p>line ${i}</p>`).join('');
  const setup = async (page: import('@playwright/test').Page, html: string, max = 300) => {
    await open(page, html);
    await page.evaluate(([toolbar, h]) => {
      const w = window as any;
      w.ed.options = { toolbar };
      (document.querySelector('.aurebesh') as HTMLElement).style.setProperty('--aurebesh-max-height', `${h}px`);
    }, [['bold', 'layout'], max] as const);
    await page.locator('.aurebesh-cmd-layout').click();
    await expect(page.locator('.aurebesh-panel')).toBeVisible();
  };

  test('the editor stays at its maximum height and the sidebar scrolls instead', async ({ page }) => {
    await setup(page, LONG);
    const stage = (await page.locator('.aurebesh-stage').boundingBox())!;
    expect(stage.height).toBeLessThanOrEqual(301); // the maximum of the text area
    const panel = page.locator('.aurebesh-panel');
    expect((await panel.boundingBox())!.height).toBeLessThanOrEqual(301);
    const scrolls = await panel.evaluate((el) => el.scrollHeight > el.clientHeight);
    expect(scrolls).toBe(true);
    await panel.evaluate((el) => (el.scrollTop = el.scrollHeight));
    expect(await panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  });

  test('no empty space is left under the text: the text area fills the height', async ({ page }) => {
    await setup(page, '<p>short</p>');
    const stage = (await page.locator('.aurebesh-stage').boundingBox())!;
    const text = (await content(page).boundingBox())!;
    expect(text.y + text.height).toBeGreaterThanOrEqual(stage.y + stage.height - 1);
  });

  test('a short sidebar does not make the editor taller than its text', async ({ page }) => {
    await setup(page, '<p>short</p>', 900);
    const stage = (await page.locator('.aurebesh-stage').boundingBox())!;
    const panel = (await page.locator('.aurebesh-panel').boundingBox())!;
    expect(stage.height).toBeLessThanOrEqual(Math.max(panel.height, 200) + 1);
  });
});
