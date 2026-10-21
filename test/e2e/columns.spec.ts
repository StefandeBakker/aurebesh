import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { content, expect, open, setHtml } from './helpers';
import { WORD_COLUMNS_HTML } from '../fixtures/paste';

const select = (page: Page) => page.locator('select.aurebesh-columns');
const value = (page: Page): Promise<string> => page.evaluate(() => (window as any).ed.value);

/** The number of CSS columns the browser actually lays out for the first column block. */
const renderedColumns = (page: Page) =>
  page.evaluate(() => {
    const div = document.querySelector('.aurebesh-content div[style*="column-count"]') as HTMLElement | null;
    return div ? getComputedStyle(div).columnCount : null;
  });

/** Selects from the start of paragraph `from` to the end of paragraph `to` (1-based), like dragging over them. */
async function selectParagraphs(page: Page, from: number, to: number): Promise<void> {
  await page.evaluate(
    ([a, b]) => {
      const c = document.querySelector('.aurebesh-content') as HTMLElement;
      c.focus();
      const ps = c.querySelectorAll('p');
      const r = document.createRange();
      r.setStart(ps[a - 1].firstChild!, 0);
      r.setEnd(ps[b - 1].lastChild!, ps[b - 1].lastChild!.textContent!.length);
      const s = getSelection()!;
      s.removeAllRanges();
      s.addRange(r);
    },
    [from, to],
  );
}

async function caretIn(page: Page, paragraph: number): Promise<void> {
  await page.evaluate((n) => {
    const c = document.querySelector('.aurebesh-content') as HTMLElement;
    c.focus();
    const p = c.querySelectorAll('p')[n - 1];
    const r = document.createRange();
    r.setStart(p.firstChild!, 1);
    r.collapse(true);
    const s = getSelection()!;
    s.removeAllRanges();
    s.addRange(r);
  }, paragraph);
}

test.describe('columns', () => {
  test('the selected paragraphs go into a column block that the browser lays out in columns', async ({ page }) => {
    await open(page, '<p>one</p><p>two</p><p>three</p><p>four</p>');
    await selectParagraphs(page, 2, 3);
    await select(page).selectOption('2');

    expect(await value(page)).toBe('<p>one</p><div style="column-count: 2; column-gap: 2em"><p>two</p><p>three</p></div><p>four</p>');
    expect(await renderedColumns(page)).toBe('2');
  });

  test('with only a caret, the block around it gets the columns', async ({ page }) => {
    await open(page, '<p>one</p><p>two</p><p>three</p>');
    await caretIn(page, 2);
    await select(page).selectOption('3');
    expect(await value(page)).toBe('<p>one</p><div style="column-count: 3; column-gap: 2em"><p>two</p></div><p>three</p>');
  });

  test('the box shows the number of columns where the caret is, and changing it updates the block', async ({ page }) => {
    await open(page, '<p>one</p><p>two</p><p>three</p>');
    await selectParagraphs(page, 1, 3);
    await select(page).selectOption('2');
    await expect(select(page)).toHaveValue('2');

    await select(page).selectOption('4');
    expect(await value(page)).toBe('<div style="column-count: 4; column-gap: 2em"><p>one</p><p>two</p><p>three</p></div>');
    expect(await renderedColumns(page)).toBe('4');

    // a caret outside the block shows 1 column again
    await setHtml(page, '<p>before</p><div style="column-count: 2"><p>in</p></div>');
    await caretIn(page, 1);
    await expect(select(page)).toHaveValue('1');
    await caretIn(page, 2);
    await expect(select(page)).toHaveValue('2');
  });

  test('one column takes the block away again, and keeps the paragraphs', async ({ page }) => {
    await open(page, '<p>one</p><p>two</p>');
    await selectParagraphs(page, 1, 2);
    await select(page).selectOption('2');
    expect(await value(page)).toContain('column-count');
    await select(page).selectOption('1');
    expect(await value(page)).toBe('<p>one</p><p>two</p>');
    expect(await renderedColumns(page)).toBeNull();
  });

  test('the selection is still there after making columns, so you can keep working', async ({ page }) => {
    await open(page, '<p>one</p><p>two</p><p>three</p>');
    await selectParagraphs(page, 1, 2);
    await select(page).selectOption('2');
    expect(await page.evaluate(() => getSelection()!.toString().replace(/\s+/g, ' ').trim())).toBe('one two');
    await page.locator('.aurebesh-toolbar button[title="Bold"]').first().click();
    expect(await value(page)).toMatch(/<div style="column-count: 2; column-gap: 2em"><p><(b|strong)>one<\/(b|strong)><\/p><p><(b|strong)>two<\/(b|strong)><\/p><\/div><p>three<\/p>/);
  });

  test('a column gap that came from Word is kept when the number of columns changes', async ({ page }) => {
    await open(page, '<div style="column-count: 2; column-gap: 35.4pt"><p>a</p><p>b</p></div>');
    await caretIn(page, 1);
    await select(page).selectOption('3');
    expect(await value(page)).toBe('<div style="column-count: 3; column-gap: 35.4pt"><p>a</p><p>b</p></div>');
  });

  test('columns survive reloading the HTML, and typing inside a column block keeps working', async ({ page }) => {
    await open(page, '<div style="column-count: 2; column-gap: 2em"><p>one</p><p>two</p></div>');
    expect(await renderedColumns(page)).toBe('2');
    await caretIn(page, 2);
    await page.keyboard.press('End');
    await page.keyboard.type(' more');
    expect(await value(page)).toBe('<div style="column-count: 2; column-gap: 2em"><p>one</p><p>two more</p></div>');
  });

  test('Markdown shortcuts still work inside a column block', async ({ page }) => {
    await open(page, '<div style="column-count: 2"><p>x</p><p><br></p></div>');
    await page.evaluate(() => {
      const c = document.querySelector('.aurebesh-content') as HTMLElement;
      c.focus();
      const p = c.querySelectorAll('p')[1];
      const r = document.createRange();
      r.setStart(p, 0);
      r.collapse(true);
      const s = getSelection()!;
      s.removeAllRanges();
      s.addRange(r);
    });
    await page.keyboard.type('- item');
    expect(await value(page)).toContain('<ul><li>item</li></ul>');
  });
});

test.describe('columns when pasting from Word', () => {
  test('a two-column section arrives as a two-column block', async ({ page }) => {
    await open(page);
    await content(page).click();
    await page.evaluate((html) => (window as any).__paste({ html, text: 'Krant kolom een' }), WORD_COLUMNS_HTML);

    const out = await value(page);
    expect(out).toContain('column-count: 2');
    expect(out).toContain('column-gap: 35.4pt');
    expect(out).toContain('<b>Krant</b> kolom een');
    expect(out).toContain('Daarna gewone tekst.');
    expect(await renderedColumns(page)).toBe('2');
    // only the first section is in columns: the text after the section break is outside the block
    const outside = await page.evaluate(() => {
      const div = document.querySelector('.aurebesh-content div[style*="column-count"]')!;
      return div.textContent!.includes('Daarna');
    });
    expect(outside).toBe(false);
  });
});
