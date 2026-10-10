import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { button, content, expect, html, open, setHtml, undo } from './helpers';

const PLAIN =
  '<table><tbody><tr><td>a1</td><td>b1</td><td>c1</td></tr><tr><td>a2</td><td>b2</td><td>c2</td></tr><tr><td>a3</td><td>b3</td><td>c3</td></tr></tbody></table><p>after</p>';
/** A 2x2 merged cell in the corner of a 3x3 grid. */
const MERGED =
  '<table><tbody><tr><td colspan="2" rowspan="2">m</td><td>c1</td></tr><tr><td>c2</td></tr><tr><td>a3</td><td>b3</td><td>c3</td></tr></tbody></table><p>after</p>';

const cell = (page: Page, text: string) => content(page).locator('td', { hasText: new RegExp(`^${text}`) }).first();
const click = (page: Page, text: string) => cell(page, text).click();

/** Selects from the start of one cell's text to the end of another's, like dragging across the cells. */
async function dragSelect(page: Page, from: string, to: string): Promise<void> {
  await page.evaluate(
    ([a, b]) => {
      const c = document.querySelector('.aurebesh-content') as HTMLElement;
      const textOf = (t: string) => {
        const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) if (n.textContent!.startsWith(t)) return n;
        throw new Error(`no text ${t}`);
      };
      const start = textOf(a);
      const end = textOf(b);
      c.focus();
      const r = document.createRange();
      r.setStart(start, 0);
      r.setEnd(end, end.textContent!.length);
      const s = getSelection()!;
      s.removeAllRanges();
      s.addRange(r);
    },
    [from, to],
  );
}

/** Checks the table is a full rectangle: every grid position is covered by exactly one cell. Returns the grid size. */
async function grid(page: Page): Promise<{ rows: number; cols: number; ok: boolean }> {
  return page.evaluate(() => {
    const t = document.querySelector('.aurebesh-content table') as HTMLTableElement;
    const rows = Array.from(t.rows);
    const used: boolean[][] = rows.map(() => []);
    let ok = true;
    let cols = 0;
    rows.forEach((tr, r) => {
      let c = 0;
      for (const td of Array.from(tr.cells)) {
        while (used[r][c]) c++;
        const cs = +(td.getAttribute('colspan') ?? 1);
        const rs = +(td.getAttribute('rowspan') ?? 1);
        for (let i = 0; i < rs; i++) {
          if (r + i >= rows.length) ok = false;
          else for (let j = 0; j < cs; j++) used[r + i][c + j] = true;
        }
        c += cs;
      }
      cols = Math.max(cols, c);
    });
    used.forEach((row) => {
      for (let c = 0; c < cols; c++) if (!row[c]) ok = false;
    });
    return { rows: rows.length, cols, ok };
  });
}

test.describe('merging and splitting cells', () => {
  test('merging two cells in a row joins their text and gives one cell colspan 2', async ({ page }) => {
    await open(page, PLAIN);
    await dragSelect(page, 'a1', 'b1');
    await button(page, 'Merge cells').click();
    const out = await html(page);
    expect(out).toContain('<td colspan="2">a1<br>b1</td><td>c1</td>');
    expect(await grid(page)).toEqual({ rows: 3, cols: 3, ok: true });
  });

  test('merging a block of cells gives colspan and rowspan, text in reading order', async ({ page }) => {
    await open(page, PLAIN);
    await dragSelect(page, 'a1', 'b2');
    await button(page, 'Merge cells').click();
    expect(await html(page)).toContain('<td colspan="2" rowspan="2">a1<br>b1<br>a2<br>b2</td>');
    expect(await grid(page)).toEqual({ rows: 3, cols: 3, ok: true });
  });

  test('empty cells add no stray line breaks', async ({ page }) => {
    await open(page, '<table><tbody><tr><td>x</td><td><br></td><td>y</td></tr></tbody></table><p>after</p>');
    await dragSelect(page, 'x', 'y');
    await button(page, 'Merge cells').click();
    expect(await html(page)).toContain('<td colspan="3">x<br>y</td>');
  });

  test('a selection that cuts through a merged cell takes the whole cell in', async ({ page }) => {
    await open(page, MERGED);
    await dragSelect(page, 'c2', 'a3'); // the rectangle between them reaches into the merged corner
    await button(page, 'Merge cells').click();
    expect(await html(page)).toContain('<td colspan="3" rowspan="3">');
    expect(await grid(page)).toEqual({ rows: 3, cols: 3, ok: true });
  });

  test('splitting gives single cells again and keeps the text in the first', async ({ page }) => {
    await open(page, MERGED);
    await click(page, 'm');
    await button(page, 'Split cell').click();
    const out = await html(page);
    expect(out).not.toContain('colspan');
    expect(out).not.toContain('rowspan');
    expect(out).toContain('<td>m</td>');
    expect(await grid(page)).toEqual({ rows: 3, cols: 3, ok: true });
    expect(await content(page).locator('td').count()).toBe(9);
  });

  test('merging can be undone with Ctrl+Z', async ({ page }) => {
    await open(page, PLAIN);
    const before = await html(page);
    await dragSelect(page, 'a1', 'b1');
    await button(page, 'Merge cells').click();
    expect(await html(page)).not.toBe(before);
    await undo(page);
    expect(await html(page)).toBe(before);
  });

  test('Merge is only on when several cells are selected, Split only inside a merged cell', async ({ page }) => {
    await open(page, MERGED);
    await click(page, 'c1');
    await expect(button(page, 'Merge cells')).toBeDisabled();
    await expect(button(page, 'Split cell')).toBeDisabled();
    await dragSelect(page, 'c1', 'c2');
    await expect(button(page, 'Merge cells')).toBeEnabled();
    await click(page, 'm');
    await expect(button(page, 'Split cell')).toBeEnabled();
    await expect(button(page, 'Merge cells')).toBeDisabled();
  });

  test('the colspan and rowspan survive a reload through the sanitizer', async ({ page }) => {
    await open(page, MERGED);
    const out = await html(page);
    await setHtml(page, out);
    expect(await html(page)).toBe(out);
  });
});

test.describe('rows and columns in a table with merged cells', () => {
  test('a row added inside a tall cell makes it taller; one added below it leaves it alone', async ({ page }) => {
    await open(page, MERGED);
    await click(page, 'c1');
    await button(page, 'Insert row below').click(); // between the rows the merged cell covers
    expect(await html(page)).toContain('rowspan="3"');
    expect(await grid(page)).toEqual({ rows: 4, cols: 3, ok: true });

    await open(page, MERGED);
    await click(page, 'm');
    await button(page, 'Insert row below').click(); // below the last row it covers
    expect(await html(page)).toContain('rowspan="2"');
    expect(await grid(page)).toEqual({ rows: 4, cols: 3, ok: true });
  });

  test('a column added inside a wide cell makes it wider; one added beside it gets a cell for each row it covers', async ({ page }) => {
    await open(page, MERGED);
    await click(page, 'a3');
    await button(page, 'Insert column right').click(); // between the columns the merged cell covers
    expect(await html(page)).toContain('colspan="3"');
    expect(await grid(page)).toEqual({ rows: 3, cols: 4, ok: true });

    await open(page, MERGED);
    await click(page, 'm');
    await button(page, 'Insert column right').click();
    expect(await grid(page)).toEqual({ rows: 3, cols: 4, ok: true });
    expect(await html(page)).toMatch(/<td rowspan="2"><br><\/td>/); // one new cell next to the 2-row cell, not one per row
  });

  test('deleting a column or row shrinks the merged cell instead of breaking the table', async ({ page }) => {
    await open(page, MERGED);
    await click(page, 'm');
    await button(page, 'Delete column').click();
    expect(await grid(page)).toEqual({ rows: 3, cols: 2, ok: true });
    expect(await content(page).locator('td', { hasText: /^m/ }).count()).toBe(1);

    await open(page, MERGED);
    await click(page, 'c1');
    await button(page, 'Delete row').click(); // the merged cell starts in this row and carries on in the next
    expect(await grid(page)).toEqual({ rows: 2, cols: 3, ok: true });
    expect(await html(page)).toContain('>m</td>');
  });

  test('Tab in the last cell still adds a row below the table', async ({ page }) => {
    await open(page, MERGED);
    await click(page, 'c3');
    await page.keyboard.press('Tab');
    expect(await grid(page)).toEqual({ rows: 4, cols: 3, ok: true });
  });

  test('the Markdown of a table with merged cells keeps the columns lined up', async ({ page }) => {
    await open(page, MERGED);
    const md = await page.evaluate(() => (window as any).ed.markdown);
    const lines = md.split('\n').slice(0, 4); // the table; the paragraph after it follows
        for (const l of lines) expect(l.split('|').length).toBe(5); // 3 cells and the two outer bars
    expect(lines[0]).toBe('| m |  | c1 |');
  });
});
