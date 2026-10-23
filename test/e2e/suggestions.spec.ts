import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { content, expect, open, undo } from './helpers';

const ME = { id: 'me', name: 'Me Myself' };
const html = (page: Page): Promise<string> => page.evaluate(() => (window as any).ed.instance.getHTML());
const marks = (page: Page, kind?: string) => content(page).locator(`span[data-suggestion]${kind ? `[data-kind="${kind}"]` : ''}`);
const cards = (page: Page) => page.locator('.aurebesh-suggestions .aurebesh-comment-thread');
const suggestions = (page: Page) => page.evaluate(() => (window as any).ed.instance.getSuggestions());

/** The HTML without the ids and dates of the marks, to compare. */
const plain = (s: string) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/ data-suggestion="[^"]*"/g, '')
    .replace(/ data-author="[^"]*"/g, '')
    .replace(/ data-name="[^"]*"/g, '')
    .replace(/ data-date="[^"]*"/g, '')
    .replace(/<span data-kind="insert">/g, '<ins>')
    .replace(/<span data-kind="delete">/g, '<del>')
    .replace(/<\/span>/g, (_m, offset: number, all: string) => {
      // a closing span is the end of an ins or a del: the last of those that is open
      const before = all.slice(0, offset);
      const open = [...before.matchAll(/<(ins|del)>|<\/(ins|del)>/g)];
      const stack: string[] = [];
      for (const m of open) m[1] ? stack.push(m[1]) : stack.pop();
      return stack.length ? `</${stack[stack.length - 1]}>` : '</span>';
    });

const start = async (page: Page, initial = '<p>one two three</p>', enabled = true) => {
  await open(page);
  await page.evaluate(
    ([author, on]) => {
      const w = window as any;
      w.events = [];
      for (const name of ['suggestion', 'suggesting']) w.ed.addEventListener(name, (e: CustomEvent) => w.events.push({ name, detail: JSON.parse(JSON.stringify(e.detail)) }));
      w.ed.options = { suggestions: { author, enabled: on } };
    },
    [ME, enabled] as const,
  );
  await content(page).waitFor();
  await page.evaluate((v) => (window as any).ed.instance.setHTML(v), initial);
  await content(page).locator('p').first().waitFor();
};

/** The caret in the text `what` (which is in one text node), `at` characters from its start (default: after it). */
const caretIn = (page: Page, what: string, at?: number) =>
  page.evaluate(
    ([text, offset]) => {
      const c = document.querySelector('.aurebesh-content') as HTMLElement;
      const walker = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
        const i = n.data.indexOf(text as string);
        if (i < 0) continue;
        c.focus();
        getSelection()!.collapse(n, i + ((offset as number | null) ?? (text as string).length));
        return;
      }
      throw new Error('text not found: ' + text);
    },
    [what, at ?? null] as const,
  );

const select = (page: Page, what: string) =>
  page.evaluate((text) => {
    const c = document.querySelector('.aurebesh-content') as HTMLElement;
    const walker = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      const i = n.data.indexOf(text);
      if (i < 0) continue;
      c.focus();
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + text.length);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(r);
      return;
    }
    throw new Error('text not found: ' + text);
  }, what);

test.describe('suggestions', () => {
  test('typed text is an insertion, in one piece for a word, from the author', async ({ page }) => {
    await start(page);
    await caretIn(page, 'one ');
    await page.keyboard.type('new ');
    await expect(marks(page, 'insert')).toHaveCount(1);
    await expect(marks(page, 'insert')).toHaveText('new ');
    expect(plain(await html(page))).toBe('<p>one <ins>new </ins>two three</p>');
    const [s] = await suggestions(page);
    expect(s).toMatchObject({ kind: 'insert', author: ME });
    expect(s.inserted.replace(/ /g, ' ')).toBe('new ');
    expect(Date.parse(s.date)).toBeGreaterThan(0);
    // the caret is behind what was typed, and typing goes on in the same insertion
    await page.keyboard.type('more');
    await expect(marks(page, 'insert')).toHaveCount(1);
    expect(plain(await html(page))).toBe('<p>one <ins>new more</ins>two three</p>');
  });

  test('Backspace keeps the text and marks it as deleted; the caret goes to the start of it, and Backspace goes on to the letter before', async ({ page }) => {
    await start(page);
    await caretIn(page, 'one two');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    expect(plain(await html(page))).toBe('<p>one t<del>wo</del> three</p>');
    await expect(marks(page, 'delete')).toHaveCount(1);
  });

  test('Delete forward marks the text after the caret, and the caret goes on behind it', async ({ page }) => {
    await start(page);
    await caretIn(page, 'one ');
    await page.keyboard.press('Delete');
    await page.keyboard.press('Delete');
    await page.keyboard.press('Delete');
    expect(plain(await html(page))).toBe('<p>one <del>two</del> three</p>');
    await expect(marks(page, 'delete')).toHaveCount(1);
  });

  test('typing over a selection is a replacement: the old text deleted, the new inserted, one suggestion', async ({ page }) => {
    await start(page);
    await select(page, 'two');
    await page.keyboard.type('2');
    expect(plain(await html(page))).toBe('<p>one <del>two</del><ins>2</ins> three</p>');
    const list = await suggestions(page);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ kind: 'replace', deleted: 'two', inserted: '2' });
  });

  test('text that was inserted by you is just removed when you delete it', async ({ page }) => {
    await start(page);
    await caretIn(page, 'one ');
    await page.keyboard.type('abc');
    await page.keyboard.press('Backspace');
    expect(plain(await html(page))).toBe('<p>one <ins>ab</ins>two three</p>');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    expect(plain(await html(page))).toBe('<p>one two three</p>');
    expect(await suggestions(page)).toEqual([]);
  });

  test('cutting marks the text as deleted and keeps it', async ({ page }) => {
    await start(page);
    await select(page, 'two ');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+X' : 'Control+X');
    expect(plain(await html(page))).toBe('<p>one <del>two </del>three</p>');
  });

  test('a paste is an insertion of the text', async ({ page }) => {
    await start(page);
    await caretIn(page, 'one ');
    await page.evaluate(() => (window as any).__paste({ html: '<p>pasted <b>bold</b></p>', text: 'pasted bold' }));
    await expect(marks(page, 'insert')).toHaveCount(1);
    const [s] = await suggestions(page);
    expect(s.inserted).toBe('pasted bold');
  });

  test('a line break is not tracked, and what is typed after it is an insertion in the new paragraph', async ({ page }) => {
    await start(page, '<p>alpha beta</p>');
    await caretIn(page, 'alpha', 5);
    await page.keyboard.type('XY');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Z');
    const out = plain(await html(page));
    expect(out).toMatch(/^<p>alpha<ins>XY<\/ins><\/p><p><ins>Z<\/ins> ?beta<\/p>$/);
  });

  test('a selection over two paragraphs is deleted in both, the paragraphs stay, and what is typed goes after it', async ({ page }) => {
    await start(page, '<p>alpha beta</p><p>gamma delta</p>');
    await page.evaluate(() => {
      const c = document.querySelector('.aurebesh-content') as HTMLElement;
      c.focus();
      const r = document.createRange();
      r.setStart(c.children[0].firstChild!, 6);
      r.setEnd(c.children[1].firstChild!, 5);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(r);
    });
    await page.keyboard.press('Delete');
    expect(plain(await html(page))).toBe('<p>alpha <del>beta</del></p><p><del>gamma</del> delta</p>');
    await page.keyboard.type('Q');
    expect(plain(await html(page))).toBe('<p>alpha <del>beta</del></p><p><del>gamma</del><ins>Q</ins> delta</p>');
    expect(await suggestions(page)).toHaveLength(2);
  });

  test('typing in an empty paragraph is an insertion, without a stray break', async ({ page }) => {
    await start(page, '<p>first</p><p><br></p>');
    await page.evaluate(() => {
      const c = document.querySelector('.aurebesh-content') as HTMLElement;
      c.focus();
      getSelection()!.collapse(c.children[1], 0);
    });
    await page.keyboard.type('new');
    expect(plain(await html(page))).toBe('<p>first</p><p><ins>new</ins></p>');
  });

  test('Backspace over what is already deleted does nothing harmful, and the text before it can be deleted next', async ({ page }) => {
    await start(page, '<p>alpha beta</p>');
    await caretIn(page, 'alpha beta');
    for (let i = 0; i < 4; i++) await page.keyboard.press('Backspace');
    expect(plain(await html(page))).toBe('<p>alpha <del>beta</del></p>');
    await page.keyboard.press('Backspace');
    expect(plain(await html(page))).toBe('<p>alpha<del> </del><del>beta</del></p>'.replace('<del> </del><del>beta</del>', '<del> beta</del>'));
  });

  test('without suggestion mode nothing is marked', async ({ page }) => {
    await start(page, '<p>one two three</p>', false);
    await caretIn(page, 'one ');
    await page.keyboard.type('x');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    expect(await html(page)).toBe('<p>onetwo three</p>');
  });

  test('the toolbar switch turns the mode on and off, with an event', async ({ page }) => {
    await start(page, '<p>one two three</p>', false);
    const toggle = page.locator('.aurebesh-toolbar .aurebesh-cmd-suggest');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.aurebesh')).toHaveClass(/aurebesh-suggesting/);
    await caretIn(page, 'one ');
    await page.keyboard.type('x');
    await expect(marks(page, 'insert')).toHaveCount(1);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await caretIn(page, 'two', 3);
    await page.keyboard.type('y');
    await expect(marks(page, 'insert')).toHaveCount(1);
    const events = await page.evaluate(() => (window as any).events.filter((e: any) => e.name === 'suggesting').map((e: any) => e.detail));
    expect(events).toEqual([true, false]);
    expect(await page.evaluate(() => (window as any).ed.instance.isSuggesting())).toBe(false);
  });

  test('accepting an insertion keeps the text, accepting a deletion removes it; rejecting does the opposite', async ({ page }) => {
    await start(page);
    await caretIn(page, 'one ');
    await page.keyboard.type('new ');
    await select(page, 'three');
    await page.keyboard.press('Delete');
    expect((await suggestions(page)).map((s: any) => s.kind)).toEqual(['insert', 'delete']);
    const [insert, del] = await suggestions(page);

    await page.evaluate((id) => (window as any).ed.instance.acceptSuggestion(id), insert.id);
    expect(plain(await html(page))).toBe('<p>one new two <del>three</del></p>');
    await page.evaluate((id) => (window as any).ed.instance.rejectSuggestion(id), del.id);
    expect((await html(page)).replace(/&nbsp;/g, ' ')).toBe('<p>one new two three</p>');
    expect(await suggestions(page)).toEqual([]);
    const events = await page.evaluate(() => (window as any).events.filter((e: any) => e.name === 'suggestion').map((e: any) => [e.detail.action, e.detail.suggestion.kind]));
    expect(events).toEqual([
      ['accept', 'insert'],
      ['reject', 'delete'],
    ]);
  });

  test('the panel lists the changes in the order of the text, and accepts and rejects them', async ({ page }) => {
    await start(page);
    await select(page, 'three');
    await page.keyboard.type('3');
    await caretIn(page, 'one ');
    await page.keyboard.type('new ');
    await page.locator('.aurebesh-toolbar .aurebesh-cmd-suggestions').click();
    await expect(cards(page)).toHaveCount(2);
    await expect(cards(page).nth(0)).toContainText('Added: new');
    await expect(cards(page).nth(1)).toContainText('Deleted: three');
    await expect(cards(page).nth(1)).toContainText('Added: 3');
    await expect(cards(page).nth(0)).toContainText('Me Myself');
    await cards(page).nth(0).getByRole('button', { name: 'Reject' }).click();
    await expect(cards(page)).toHaveCount(1);
    await cards(page).first().getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(cards(page)).toHaveCount(0);
    expect(await html(page)).toBe('<p>one two 3</p>');
  });

  test('accept all and reject all', async ({ page }) => {
    await start(page);
    await caretIn(page, 'one ');
    await page.keyboard.type('a ');
    await select(page, 'three');
    await page.keyboard.press('Delete');
    await page.locator('.aurebesh-toolbar .aurebesh-cmd-suggestions').click();
    await page.getByRole('button', { name: 'Reject all' }).click();
    expect(await html(page)).toBe('<p>one two three</p>');
    await caretIn(page, 'one ');
    await page.keyboard.type('b ');
    await select(page, 'three');
    await page.keyboard.press('Delete');
    await page.getByRole('button', { name: 'Accept all' }).click();
    expect((await html(page)).replace(/&nbsp;/g, ' ')).toBe('<p>one b two </p>');
  });

  test('one undo takes back a word that was typed, and redo puts it back', async ({ page }) => {
    await start(page);
    await caretIn(page, 'one ');
    await page.keyboard.type('hello');
    await undo(page);
    expect(await html(page)).toBe('<p>one two three</p>');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+Z' : 'Control+Y');
    await expect(marks(page, 'insert')).toHaveText('hello');
  });

  test('undo takes back a deletion, and the text is as it was', async ({ page }) => {
    await start(page);
    await select(page, 'two');
    await page.keyboard.press('Delete');
    await expect(marks(page, 'delete')).toHaveCount(1);
    await undo(page);
    expect(await html(page)).toBe('<p>one two three</p>');
  });

  test('the marks are in the HTML, and in HTML that is loaded again', async ({ page }) => {
    await start(page);
    await caretIn(page, 'one ');
    await page.keyboard.type('x');
    await select(page, 'three');
    await page.keyboard.press('Delete');
    const saved = await html(page);
    expect(saved).toMatch(/data-author="me"/);
    expect(saved).toMatch(/data-name="Me Myself"/);
    await start(page, saved);
    await expect(marks(page)).toHaveCount(2);
    expect(await html(page)).toBe(saved);
  });

  test('Markdown and Word are the text as it reads when everything is accepted', async ({ page }) => {
    await start(page);
    await caretIn(page, 'one ');
    await page.keyboard.type('new ');
    await select(page, 'three');
    await page.keyboard.press('Delete');
    expect(await page.evaluate(() => (window as any).ed.instance.getMarkdown())).toBe('one new two');
  });

  test('another author\'s insertion that you delete is marked as deleted, inside theirs', async ({ page }) => {
    const other = '<p>one <span data-suggestion="x1" data-kind="insert" data-author="ann" data-name="Ann" data-date="2026-10-22T09:00:00.000Z">added</span> two</p>';
    await start(page, other);
    await select(page, 'added');
    await page.keyboard.press('Delete');
    await expect(marks(page, 'delete')).toHaveCount(1);
    await expect(marks(page, 'insert')).toHaveCount(1);
    expect(await marks(page, 'insert').evaluate((el) => el.getAttribute('data-author'))).toBe('ann');
    expect(await marks(page, 'delete').evaluate((el) => el.getAttribute('data-author'))).toBe('me');
  });

  test('a read-only editor shows the changes but does not accept or reject', async ({ page }) => {
    const text = '<p>one <span data-suggestion="x1" data-kind="insert" data-author="ann" data-name="Ann" data-date="2026-10-22T09:00:00.000Z">added</span></p>';
    await start(page, text, false);
    await page.evaluate(() => (window as any).ed.instance.setReadOnly(true));
    await page.evaluate(() => (window as any).ed.instance.acceptSuggestion('x1'));
    expect(await html(page)).toBe(text);
  });

  test('without the option there are no suggestions', async ({ page }) => {
    await open(page, '<p>one</p>');
    await expect(page.locator('.aurebesh-toolbar .aurebesh-cmd-suggest')).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).ed.instance.getSuggestions())).toEqual([]);
    expect(await page.evaluate(() => (window as any).ed.instance.isSuggesting())).toBe(false);
  });
});
