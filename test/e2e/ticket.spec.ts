import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { expect } from './helpers';

const content = (page: Page) => page.locator('.aurebesh-content');

async function openTicket(page: Page, code?: string): Promise<void> {
  await page.goto('/test/e2e/ticket.html');
  await content(page).waitFor();
  if (code !== undefined) await setTemplate(page, code);
}

const setTemplate = (page: Page, code: string) => page.evaluate((c) => ((window as any).ed.template = c), code);
const template = (page: Page): Promise<string> => page.evaluate(() => (window as any).ed.template);
const button = (page: Page, title: string) => page.locator(`.aurebesh-toolbar button[title="${title}"]`).first();

/** Selects the text of one line from a start position to an end position, counted in characters of that line's text. */
async function selectText(page: Page, text: string, from = 0, to?: number): Promise<void> {
  await page.evaluate(
    ([t, f, e]) => {
      const c = document.querySelector('.aurebesh-content') as HTMLElement;
      const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const i = n.textContent!.indexOf(t as string);
        if (i >= 0) {
          c.focus();
          const r = document.createRange();
          r.setStart(n, i + (f as number));
          r.setEnd(n, e === null ? i + (t as string).length : i + (e as number));
          const s = getSelection()!;
          s.removeAllRanges();
          s.addRange(r);
          return;
        }
      }
      throw new Error(`no text ${t}`);
    },
    [text, from, to ?? null] as const,
  );
}

/** Puts the caret at the end of the text that contains `text`. */
const caretAfter = (page: Page, text: string) => selectText(page, text, text.length, text.length);

test.describe('ticket layout', () => {
  test('a template shows as lines with fields, and comes back exactly as it was while nothing is changed', async ({ page }) => {
    const code = '[*center*][*extragroot*]CAFE[*normaal*]\n[*left*]Order [*Order.Number, "%6s"*]\n[*IFNOT Order.Type,"2"*]eat in[*endif*]\n';
    await openTicket(page, code);
    expect(await content(page).locator('p').count()).toBe(4);
    expect(await content(page).locator('[data-t="field"]').count()).toBe(1);
    expect(await template(page)).toBe(code); // not even the spaces and the case of the tags changed
  });

  test('fields show their sample value in the width of their format, or their name when asked', async ({ page }) => {
    await openTicket(page, 'x[*Order.Total,"%8s"*]y');
    await expect(content(page).locator('[data-t="field"]')).toHaveText('   12.50');
    await page.getByLabel('Show field names').check();
    await expect(content(page).locator('[data-t="field"]')).toHaveText('Order.T…'); // cut to the 8 columns the format reserves
  });

  test('typing changes the template, and a template event tells about it', async ({ page }) => {
    await openTicket(page, 'Hello');
    await page.evaluate(() => {
      (window as any).codes = [];
      (window as any).ed.addEventListener('template', (e: CustomEvent) => (window as any).codes.push(e.detail));
    });
    await caretAfter(page, 'Hello');
    await page.keyboard.type(' world');
    await expect.poll(() => template(page)).toBe('Hello world');
    expect(await page.evaluate(() => (window as any).codes.at(-1))).toBe('Hello world');
  });

  test('Enter makes a new line that keeps the alignment and size, and Backspace joins them again', async ({ page }) => {
    await openTicket(page, '[*center*][*groot*]ab');
    await caretAfter(page, 'ab');
    await page.keyboard.press('Enter');
    await page.keyboard.type('cd');
    expect(await content(page).locator('p').count()).toBe(2);
    await expect.poll(() => template(page)).toBe('[*center*][*groot*]ab\ncd');
    await page.keyboard.press('Home');
    await page.keyboard.press('Backspace');
    await expect.poll(() => template(page)).toBe('[*center*][*groot*]abcd');
  });

  test('a field is one unit: Backspace after it removes all of it', async ({ page }) => {
    await openTicket(page, 'a[*Order.Total,"%8s"*]b');
    await caretAfter(page, 'a');
    await page.keyboard.press('ArrowRight'); // over the field
    await page.keyboard.press('Backspace');
    await expect.poll(() => template(page)).toBe('ab');
  });
});

test.describe('inserting', () => {
  test('a field from the list goes in at the caret with its format, and the list can be searched', async ({ page }) => {
    await openTicket(page, 'Total: ');
    await caretAfter(page, 'Total: ');
    await button(page, 'Insert field').click();
    const tagItems = page.locator('.aurebesh-ticket-pop-tag .aurebesh-ticket-item');
    await expect(tagItems).toHaveCount(6);
    await page.locator('.aurebesh-ticket-pop-tag input').fill('item.price');
    await expect(tagItems).toHaveCount(1);
    await tagItems.click();
    expect(await template(page)).toBe('Total: [*Item.Price,"%8s"*]');
    await expect(page.locator('.aurebesh-ticket-pop-tag')).toBeHidden();
  });

  test('a name that is not in the list can be typed', async ({ page }) => {
    await openTicket(page, 'x');
    await caretAfter(page, 'x');
    await button(page, 'Insert field').click();
    await page.locator('.aurebesh-ticket-pop-tag input').fill('Custom.Field');
    await page.locator('.aurebesh-ticket-pop-tag .aurebesh-ticket-item', { hasText: '+ Custom.Field' }).click();
    expect(await template(page)).toBe('x[*Custom.Field*]');
  });

  test('a command goes in, and "include" asks for a file name', async ({ page }) => {
    await openTicket(page, 'a');
    await caretAfter(page, 'a');
    await button(page, 'Insert command').click();
    await page.locator('.aurebesh-ticket-pop-cmd .aurebesh-ticket-item', { hasText: 'euro' }).click();
    await button(page, 'Insert command').click();
    await page.locator('.aurebesh-ticket-pop-cmd .aurebesh-ticket-item', { hasText: 'include' }).click();
    await page.locator('.aurebesh-ticket-pop-cmd input').fill('Footer.txt');
    await page.keyboard.press('Enter');
    expect(await template(page)).toBe('a[*euro*][*include "Footer.txt"*]');
  });

  test('what is inserted takes the size of the text before it', async ({ page }) => {
    await openTicket(page, '[*groot*]Sum ');
    await caretAfter(page, 'Sum ');
    await button(page, 'Insert field').click();
    await page.locator('.aurebesh-ticket-pop-tag .aurebesh-ticket-item', { hasText: 'Total' }).click();
    expect(await template(page)).toBe('[*groot*]Sum [*Order.Total,"%8s"*]');
  });

  test('a selection is replaced by what is inserted', async ({ page }) => {
    await openTicket(page, 'Price: xx');
    await selectText(page, 'xx');
    await button(page, 'Insert field').click();
    await page.locator('.aurebesh-ticket-pop-tag .aurebesh-ticket-item', { hasText: 'Total' }).click();
    expect(await template(page)).toBe('Price: [*Order.Total,"%8s"*]');
  });
});

test.describe('size and alignment', () => {
  test('the size select applies to the selected text only, and the select follows the caret', async ({ page }) => {
    await openTicket(page, 'one two three');
    await selectText(page, 'two');
    await page.locator('select.aurebesh-ticket-size').selectOption('extragroot');
    expect(await template(page)).toBe('one [*extragroot*]two[*normaal*] three');
    await caretAfter(page, 'two');
    await expect(page.locator('select.aurebesh-ticket-size')).toHaveValue('extragroot');
    await caretAfter(page, ' three');
    await expect(page.locator('select.aurebesh-ticket-size')).toHaveValue('normaal');
  });

  test('without a selection the size is for the whole line', async ({ page }) => {
    await openTicket(page, 'one\ntwo');
    await caretAfter(page, 'two');
    await page.locator('select.aurebesh-ticket-size').selectOption('groot');
    expect(await template(page)).toBe('one\n[*groot*]two');
  });

  test('a size can be changed back, over several lines', async ({ page }) => {
    await openTicket(page, '[*groot*]aa\nbb\n[*extragroot*]cc');
    await page.evaluate(() => {
      const c = document.querySelector('.aurebesh-content') as HTMLElement;
      const r = document.createRange();
      r.setStart(c.querySelector('p')!.firstChild!.firstChild!, 0);
      const last = c.querySelectorAll('p')[2];
      r.setEnd(last.firstChild!.firstChild!, 2);
      c.focus();
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(r);
    });
    await page.locator('select.aurebesh-ticket-size').selectOption('normaal');
    expect(await template(page)).toBe('aa\nbb\ncc');
  });

  test('alignment applies to the lines of the selection, and the buttons show it', async ({ page }) => {
    await openTicket(page, 'one\ntwo\nthree');
    await caretAfter(page, 'two');
    await button(page, 'Align center').click();
    expect(await template(page)).toBe('one\n[*center*]two\n[*left*]three');
    await expect(button(page, 'Align center')).toHaveAttribute('aria-pressed', 'true');
    await button(page, 'Align right').click();
    expect(await template(page)).toBe('one\n[*right*]two\n[*left*]three');
    await button(page, 'Align left').click();
    expect(await template(page)).toBe('one\ntwo\nthree');
  });
});

test.describe('conditions', () => {
  async function addCondition(page: Page, text: string, kind: 'if' | 'ifnot', field: string, value: string) {
    await selectText(page, text);
    await button(page, 'Condition').click();
    const form = page.locator('.aurebesh-ticket-pop-cond .aurebesh-ticket-form');
    await form.locator('select').selectOption(kind);
    await form.locator('input').nth(0).fill(field);
    await form.locator('input').nth(1).fill(value);
    await form.getByRole('button', { name: 'Apply' }).click();
  }

  test('a condition around the selected text gives If and Endif in the code, but nothing readable in the layout', async ({ page }) => {
    await openTicket(page, 'eat in only\nalways');
    await addCondition(page, 'eat in only', 'if', 'Order.Type', '1');
    expect(await template(page)).toBe('[*If Order.Type,"1"*]eat in only[*Endif*]\nalways');
    await expect(content(page)).not.toContainText('Order.Type'); // only marks
    expect(await content(page).locator('[data-t="if"]').count()).toBe(1);
  });

  test('a condition can start in one line and end in another', async ({ page }) => {
    await openTicket(page, 'one\ntwo\nthree');
    await page.evaluate(() => {
      const c = document.querySelector('.aurebesh-content') as HTMLElement;
      const ps = c.querySelectorAll('p');
      const r = document.createRange();
      r.setStart(ps[0].firstChild!, 1);
      r.setEnd(ps[2].firstChild!, 2);
      c.focus();
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(r);
    });
    await button(page, 'Condition').click();
    const form = page.locator('.aurebesh-ticket-pop-cond .aurebesh-ticket-form');
    await form.locator('select').selectOption('ifnot');
    await form.locator('input').nth(0).fill('A.B');
    await form.getByRole('button', { name: 'Apply' }).click();
    expect(await template(page)).toBe('o[*Ifnot A.B*]ne\ntwo\nth[*Endif*]ree');
  });

  test('with a caret and no selection the condition goes around the line', async ({ page }) => {
    await openTicket(page, 'a\nbb\nc');
    await caretAfter(page, 'bb');
    await button(page, 'Condition').click();
    const form = page.locator('.aurebesh-ticket-pop-cond .aurebesh-ticket-form');
    await form.locator('input').nth(0).fill('X.Y');
    await form.locator('input').nth(1).fill('1');
    await form.getByRole('button', { name: 'Apply' }).click();
    expect(await template(page)).toBe('a\n[*If X.Y,"1"*]bb[*Endif*]\nc');
  });

  test('a field name with spaces or an empty one is refused with a message', async ({ page }) => {
    await openTicket(page, 'abc');
    await selectText(page, 'abc');
    await button(page, 'Condition').click();
    const form = page.locator('.aurebesh-ticket-pop-cond .aurebesh-ticket-form');
    await form.locator('input').nth(0).fill('two words');
    await form.getByRole('button', { name: 'Apply' }).click();
    await expect(page.locator('.aurebesh-status.error')).toBeVisible();
    expect(await template(page)).toBe('abc');
  });

  test('the options change what the preview prints', async ({ page }) => {
    await openTicket(page, '[*If Order.Type,"1"*]EAT IN[*Endif*][*If Order.Type,"2"*]TAKE AWAY[*Endif*]\n[*Ifnot Order.Type,"2"*]not away[*Endif*]');
    const paper = page.locator('.aurebesh-ticket-paper');
    const select = page.locator('.aurebesh-ticket-option select');
    await expect(select).toHaveValue('1'); // the sample of the field
    await expect(paper).toContainText('EAT IN');
    await expect(paper).not.toContainText('TAKE AWAY');
    await expect(paper).toContainText('not away');
    await select.selectOption('2');
    await expect(paper).toContainText('TAKE AWAY');
    await expect(paper).not.toContainText('EAT IN');
    await expect(paper).not.toContainText('not away');
    await select.selectOption('');
    await expect(paper).not.toContainText('EAT IN');
    await expect(paper).toContainText('not away');
  });

  test('a condition that is not a plain comparison gets a switch', async ({ page }) => {
    await openTicket(page, '[*if Order.Number,"{9000"*]small[*endif*]');
    const paper = page.locator('.aurebesh-ticket-paper');
    await expect(paper).not.toContainText('small');
    await page.locator('.aurebesh-ticket-option input[type="checkbox"]').check();
    await expect(paper).toContainText('small');
  });

  test('the panel lists the conditions; Edit changes one, Remove takes the marks away and keeps the text', async ({ page }) => {
    await openTicket(page, '[*If A.B,"1"*]keep me[*Endif*]');
    const row = page.locator('.aurebesh-ticket-cond');
    await expect(row).toContainText('If A.B = 1');
    await row.getByRole('button', { name: 'Edit' }).click();
    await row.locator('input').nth(1).fill('7');
    await row.getByRole('button', { name: 'Apply' }).click();
    expect(await template(page)).toBe('[*If A.B,"7"*]keep me[*Endif*]');
    await page.locator('.aurebesh-ticket-cond').getByRole('button', { name: 'Remove' }).click();
    expect(await template(page)).toBe('keep me');
    await expect(page.locator('.aurebesh-ticket-cond')).toHaveCount(0);
  });

  test('a condition without Endif, or an Endif without a condition, is reported', async ({ page }) => {
    await openTicket(page, 'a\n[*If A,"1"*]b');
    await expect(page.locator('.aurebesh-ticket-warn')).toContainText('has no Endif');
    await setTemplate(page, 'a[*Endif*]');
    await expect(page.locator('.aurebesh-ticket-warn')).toContainText('Endif without a condition');
    await setTemplate(page, 'fine');
    await expect(page.locator('.aurebesh-ticket-warn')).toBeEmpty();
    expect(await page.evaluate(() => (window as any).ed.instance.getTemplateProblems())).toEqual([]);
  });
});

test.describe('chips', () => {
  test('clicking a field shows its format to change, and Remove takes it away', async ({ page }) => {
    await openTicket(page, 'x[*Order.Total,"%8s"*]y');
    await content(page).locator('[data-t="field"]').click();
    const tools = page.locator('.aurebesh-ticket-chip-tools');
    await expect(tools).toBeVisible();
    await expect(tools).toContainText('Order.Total');
    await tools.locator('input').fill('%-10s');
    await tools.getByRole('button', { name: 'Apply' }).click();
    expect(await template(page)).toBe('x[*Order.Total,"%-10s"*]y');
    await content(page).locator('[data-t="field"]').click();
    await tools.locator('input').fill('');
    await tools.getByRole('button', { name: 'Apply' }).click();
    expect(await template(page)).toBe('x[*Order.Total*]y');
    await content(page).locator('[data-t="field"]').click();
    await tools.getByRole('button', { name: 'Remove' }).click();
    expect(await template(page)).toBe('xy');
    await expect(tools).toBeHidden();
  });

  test('the tools go away when the caret moves elsewhere', async ({ page }) => {
    await openTicket(page, 'x[*Order.Total,"%8s"*]y');
    await content(page).locator('[data-t="field"]').click();
    await expect(page.locator('.aurebesh-ticket-chip-tools')).toBeVisible();
    await caretAfter(page, 'y');
    await expect(page.locator('.aurebesh-ticket-chip-tools')).toBeHidden();
  });

  test('a format with a quote is refused', async ({ page }) => {
    await openTicket(page, '[*Order.Total*]');
    await content(page).locator('[data-t="field"]').click();
    await page.locator('.aurebesh-ticket-chip-tools input').fill('%8s"');
    await page.locator('.aurebesh-ticket-chip-tools').getByRole('button', { name: 'Apply' }).click();
    expect(await template(page)).toBe('[*Order.Total*]');
  });
});

test.describe('undo and copy', () => {
  test('undo and redo walk through the edits, with the buttons and with the keyboard', async ({ page }) => {
    await openTicket(page, 'abc');
    await caretAfter(page, 'abc');
    await button(page, 'Insert field').click();
    await page.locator('.aurebesh-ticket-pop-tag .aurebesh-ticket-item', { hasText: 'Total' }).click();
    await selectText(page, 'abc');
    await page.locator('select.aurebesh-ticket-size').selectOption('groot');
    expect(await template(page)).toBe('[*groot*]abc[*normaal*][*Order.Total,"%8s"*]');
    await button(page, 'Undo').click();
    expect(await template(page)).toBe('abc[*Order.Total,"%8s"*]');
    await page.keyboard.press('Control+Z');
    expect(await template(page)).toBe('abc');
    await page.keyboard.press('Control+Shift+Z');
    expect(await template(page)).toBe('abc[*Order.Total,"%8s"*]');
    await button(page, 'Redo').click();
    expect(await template(page)).toBe('[*groot*]abc[*normaal*][*Order.Total,"%8s"*]');
    await expect(button(page, 'Redo')).toBeDisabled();
  });

  test('typing in one go is one undo step', async ({ page }) => {
    await openTicket(page, 'x');
    await caretAfter(page, 'x');
    await page.keyboard.type('hello');
    await expect.poll(() => template(page)).toBe('xhello');
    await page.keyboard.press('Control+Z');
    expect(await template(page)).toBe('x');
  });

  test('a new edit after undo drops what could have been redone', async ({ page }) => {
    await openTicket(page, 'a');
    await caretAfter(page, 'a');
    await button(page, 'Align center').click();
    await button(page, 'Undo').click();
    await button(page, 'Align right').click();
    await expect(button(page, 'Redo')).toBeDisabled();
    expect(await template(page)).toBe('[*right*]a');
  });

  test('copying gives template code, and pasting it brings fields, sizes and conditions back', async ({ page }) => {
    await openTicket(page, '[*groot*]Big [*Order.Total,"%8s"*][*If A,"1"*]yes[*Endif*][*normaal*]\nsecond');
    await page.evaluate(() => {
      const c = document.querySelector('.aurebesh-content') as HTMLElement;
      const ps = c.querySelectorAll('p');
      const r = document.createRange();
      r.setStart(ps[0], 0);
      r.setEnd(ps[0], ps[0].childNodes.length);
      c.focus();
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(r);
    });
    const copied = await page.evaluate(() => {
      const dt = new DataTransfer();
      document.querySelector('.aurebesh-content')!.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
      return dt.getData('text/plain');
    });
    expect(copied).toContain('[*Order.Total,"%8s"*]');
    expect(copied).toContain('[*If A,"1"*]yes[*Endif*]');
    expect(copied).toContain('[*groot*]');
    await caretAfter(page, 'second');
    await page.evaluate((text) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      document.querySelector('.aurebesh-content')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, copied);
    const t = await template(page);
    expect(t.endsWith('second' + copied)).toBe(true);
    expect(await content(page).locator('[data-t="field"]').count()).toBe(2);
  });

  test('pasting plain text takes the size of the text around it, and splits into lines', async ({ page }) => {
    await openTicket(page, '[*groot*]ab');
    await caretAfter(page, 'ab');
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'X\nY');
      document.querySelector('.aurebesh-content')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    expect(await template(page)).toBe('[*groot*]abX\nY');
  });

  test('cutting removes the selection and puts the code on the clipboard', async ({ page }) => {
    await openTicket(page, 'one [*Order.Total*] two');
    await page.evaluate(() => {
      const c = document.querySelector('.aurebesh-content') as HTMLElement;
      const p = c.querySelector('p')!;
      const r = document.createRange();
      r.setStart(p.firstChild!, 1);
      r.setEnd(p.lastChild!, 2);
      c.focus();
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(r);
    });
    const cut = await page.evaluate(() => {
      const dt = new DataTransfer();
      document.querySelector('.aurebesh-content')!.dispatchEvent(new ClipboardEvent('cut', { clipboardData: dt, bubbles: true, cancelable: true }));
      return dt.getData('text/plain');
    });
    expect(cut).toBe('ne [*Order.Total*] t');
    expect(await template(page)).toBe('owo');
  });
});

test.describe('code and HTML', () => {
  test('the code tab shows the template; editing it and pressing the button reads it into the layout', async ({ page }) => {
    await openTicket(page, 'old');
    await page.getByRole('tab', { name: 'Code' }).click();
    const area = page.locator('.aurebesh-ticket-code');
    await expect(area).toHaveValue('old');
    const load = page.getByRole('button', { name: 'Read code into the layout' });
    await expect(load).toBeDisabled();
    await area.fill('[*center*]new [*Order.Total,"%8s"*]');
    await expect(load).toBeEnabled();
    await load.click();
    await expect(content(page).locator('[data-t="field"]')).toHaveCount(1);
    expect(await template(page)).toBe('[*center*]new [*Order.Total,"%8s"*]');
    await expect(load).toBeDisabled();
  });

  test('typing in the code area is not overwritten while the layout changes', async ({ page }) => {
    await openTicket(page, 'a');
    await page.getByRole('tab', { name: 'Code' }).click();
    const area = page.locator('.aurebesh-ticket-code');
    await area.fill('half typed');
    await page.evaluate(() => ((window as any).ed.instance.getTemplateLines(), (window as any).ed.instance.setHTML((window as any).ed.value)));
    await expect(area).toHaveValue('half typed');
  });

  test('the HTML keeps the layout and loads again to the same layout', async ({ page }) => {
    const code = '[*center*][*extragroot*]TITLE[*normaal*]\n[*If A,"1"*]x[*Order.Total,"%8s"*][*euro*][*Endif*]\n[*right*][*include "F.txt"*]';
    await openTicket(page, code);
    const lines = () => page.evaluate(() => JSON.stringify((window as any).ed.instance.getTemplateLines()));
    const before = await lines();
    const html = await page.evaluate(() => (window as any).ed.value);
    expect(html).toContain('data-t="field"');
    expect(html).not.toContain('contenteditable'); // the sanitizer's output has no such attribute: it is put back on loading
    await setTemplate(page, 'something else');
    await page.evaluate((h) => (window as any).ed.instance.setHTML(h), html);
    // the layout is the same; the code is built again from it, so a size command may stand in another place
    expect(await lines()).toBe(before);
    expect(await template(page)).toContain('[*If A,"1"*]');
    expect(await content(page).locator('[data-t="field"]').first().getAttribute('contenteditable')).toBe('false');
  });

  test('the sanitizer keeps only values that are safe in the layout markup', async ({ page }) => {
    await openTicket(page);
    await page.evaluate(() =>
      (window as any).ed.instance.setHTML(
        '<p><span data-t="field" data-name="Ok.Name" data-fmt="%8s">x</span><span data-t="field" data-name="bad name">y</span><span data-t="field" data-name="A" data-fmt="&quot;><img src=x onerror=alert(1)>">z</span><span data-t="evil">e</span></p>',
      ),
    );
    const html = await page.evaluate(() => document.querySelector('.aurebesh-content')!.innerHTML);
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<img');
    expect(await content(page).locator('[data-t="field"]').count()).toBe(2); // "Ok.Name" and the one whose bad format was dropped
  });

  test('template format for a form, and the element property', async ({ page }) => {
    await openTicket(page, 'ab [*Order.Total*]');
    expect(await page.evaluate(() => (window as any).ed.instance.getValue('template'))).toBe('ab [*Order.Total*]');
    expect(await page.evaluate(() => (window as any).ed.template)).toBe('ab [*Order.Total*]');
  });

  test('the ticket option without the add-on says what to import', async ({ page }) => {
    await page.goto('/test/e2e/page.html'); // this page does not import aurebesh/ticket
    await content(page).waitFor();
    const err = await page.evaluate(async () => {
      const url = '/dist/index.js'; // a variable, so that TypeScript does not look for the file
      const { Aurebesh } = await import(url);
      try {
        new Aurebesh(document.createElement('div'), { ticket: {} });
        return '';
      } catch (e) {
        return (e as Error).message;
      }
    });
    expect(err).toContain("import 'aurebesh/ticket'");
  });

  test('getTemplate in the normal editor says it needs the ticket option', async ({ page }) => {
    await page.goto('/test/e2e/page.html');
    await content(page).waitFor();
    const err = await page.evaluate(() => {
      try {
        (window as any).ed.instance.getTemplate();
        return '';
      } catch (e) {
        return (e as Error).message;
      }
    });
    expect(err).toMatch(/ticket/);
  });
});

test.describe('preview', () => {
  test('sizes and alignment show in the preview, and a line that is too wide is marked', async ({ page }) => {
    await openTicket(page, '[*center*][*extragroot*]BIG\n[*left*][*normaal*]' + 'x'.repeat(45) + '\n[*cutbon*]');
    const lines = page.locator('.aurebesh-ticket-pl');
    await expect(lines).toHaveCount(2); // the cut is not a line: it ends the piece of paper
    await expect(lines.nth(0)).toHaveCSS('text-align', 'center');
    await expect(lines.nth(1)).toHaveClass(/over/);
    await expect(lines.nth(1)).toHaveAttribute('title', '45 of 41 columns');
  });

  test('the preview is paper torn off a roll: a cut ends a piece and the text after it is a new piece', async ({ page }) => {
    await openTicket(page, 'one\ntwo\n[*cutbon*]\nthree\n[*cutbon*]');
    const slips = page.locator('.aurebesh-ticket-paper').first().locator('.aurebesh-ticket-slip');
    await expect(slips).toHaveCount(2); // nothing after the last cut: no empty piece
    await expect(slips.nth(0).locator('.aurebesh-ticket-pl')).toHaveCount(2);
    // the line break after the cut command is a blank line at the top of the new piece, as on a printer
    await expect(slips.nth(1).locator('.aurebesh-ticket-pl').last()).toHaveText('three');
    // uneven edges: a polygon of points, different for every piece, and no dashed line
    const paths = await slips.evaluateAll((els) => els.map((e) => (e as HTMLElement).style.clipPath));
    expect(paths[0]).toMatch(/^polygon\(/);
    expect(paths[0].split(',').length).toBeGreaterThan(80);
    expect(paths[0]).not.toBe(paths[1]);
    await expect(page.locator('.aurebesh-ticket-pl.cut')).toHaveCount(0);
  });

  test('a ticket without any content is a bare piece of paper, and the torn edges do not change when it is drawn again', async ({ page }) => {
    await openTicket(page, '');
    const slip = page.locator('.aurebesh-ticket-paper').first().locator('.aurebesh-ticket-slip');
    await expect(slip).toHaveCount(1);
    const before = await slip.evaluate((e) => (e as HTMLElement).style.clipPath);
    await setTemplate(page, 'something');
    expect(await page.locator('.aurebesh-ticket-paper').first().locator('.aurebesh-ticket-slip').evaluate((e) => (e as HTMLElement).style.clipPath)).toBe(before);
  });

  test('a large size takes more room in the layout: extra large is twice as wide, large as wide as normal', async ({ page }) => {
    await openTicket(page, 'abcd\n[*groot*]abcd\n[*extragroot*]abcd');
    const widths = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.aurebesh-content p')).map((p) => {
        const r = document.createRange();
        r.selectNodeContents(p);
        return r.getBoundingClientRect().width;
      }),
    );
    expect(Math.abs(widths[1] - widths[0])).toBeLessThan(2);
    expect(Math.abs(widths[2] / widths[0] - 2)).toBeLessThan(0.1);
  });

  test('a line of 41 characters fills the layout exactly, a 42nd wraps', async ({ page }) => {
    await openTicket(page, '-'.repeat(41) + '\n' + '-'.repeat(42));
    const heights = await page.evaluate(() => Array.from(document.querySelectorAll('.aurebesh-content p')).map((p) => p.getBoundingClientRect().height));
    expect(heights[1]).toBeGreaterThan(heights[0] * 1.5);
  });
});

test.describe('the column ruler', () => {
  const hasRuler = (page: Page) => content(page).evaluate((c) => getComputedStyle(c).backgroundImage.includes('gradient'));

  test('is on to begin with, and a switch in the panel turns it off and on', async ({ page }) => {
    await openTicket(page, 'abc');
    expect(await hasRuler(page)).toBe(true);
    const toggle = page.getByLabel('Show the column ruler');
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    expect(await hasRuler(page)).toBe(false);
    await toggle.check();
    expect(await hasRuler(page)).toBe(true);
  });

  test('the ruler option decides how it starts, and the switch follows it', async ({ page }) => {
    await openTicket(page, 'abc');
    await page.evaluate(() => ((window as any).ed.options = { ticket: { template: 'abc', ruler: false } }));
    expect(await hasRuler(page)).toBe(false);
    await expect(page.getByLabel('Show the column ruler')).not.toBeChecked();
    await page.getByLabel('Show the column ruler').check();
    expect(await hasRuler(page)).toBe(true);
  });

  test('does not change the layout: the same columns and the same template', async ({ page }) => {
    await openTicket(page, 'abc\n[*Order.Total*]');
    const before = await content(page).evaluate((c) => c.getBoundingClientRect().width);
    await page.getByLabel('Show the column ruler').uncheck();
    expect(await content(page).evaluate((c) => c.getBoundingClientRect().width)).toBe(before);
    expect(await template(page)).toBe('abc\n[*Order.Total*]');
  });
});

test.describe('read-only', () => {
  test('the tools and the code button are off, and the layout cannot be changed', async ({ page }) => {
    await openTicket(page, 'abc');
    await page.evaluate(() => (window as any).ed.setAttribute('readonly', ''));
    await expect(page.locator('select.aurebesh-ticket-size')).toBeDisabled();
    await expect(button(page, 'Align center')).toBeDisabled();
    await page.getByRole('tab', { name: 'Code' }).click();
    await page.locator('.aurebesh-ticket-code').fill('other');
    await expect(page.getByRole('button', { name: 'Read code into the layout' })).toBeDisabled();
    expect(await template(page)).toBe('abc');
  });
});

test.describe('dutch', () => {
  test('the labels can be translated', async ({ page }) => {
    await openTicket(page);
    await page.evaluate(() => {
      const ed = (window as any).ed;
      ed.options = { ...ed.options, labels: { 'ui.ticket.preview': 'Voorbeeld', ticketTag: 'Veld invoegen', 'ui.ticket.if': 'Als' } };
    });
    await expect(page.getByRole('tab', { name: 'Voorbeeld' })).toBeVisible();
    await expect(button(page, 'Veld invoegen')).toBeVisible();
  });
});
