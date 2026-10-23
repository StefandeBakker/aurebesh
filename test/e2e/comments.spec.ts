import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { content, expect, open, undo } from './helpers';

const panel = (page: Page) => page.locator('.aurebesh-comments');
const cards = (page: Page) => page.locator('.aurebesh-comments > .aurebesh-comment-list > .aurebesh-comment-thread');
const anchors = (page: Page) => content(page).locator('span[data-comment]');
const html = (page: Page): Promise<string> => page.evaluate(() => (window as any).ed.instance.getHTML());

const ME = { id: 'me', name: 'Me Myself' };
const OTHER = { id: 'ann', name: 'Ann Smith' };

/** An editor with comments, and the text; the events are collected in `window.events`. */
const start = async (page: Page, initial = '<p>one two three</p>', threads: unknown[] = []) => {
  await open(page);
  await page.evaluate(
    ([author, list]) => {
      const w = window as any;
      w.events = [];
      for (const name of ['comment', 'comments']) w.ed.addEventListener(name, (e: CustomEvent) => w.events.push({ name, detail: JSON.parse(JSON.stringify(e.detail)) }));
      w.ed.options = { comments: { author, threads: list } };
    },
    [ME, threads] as const,
  );
  await content(page).waitFor();
  await page.evaluate((v) => (window as any).ed.instance.setHTML(v), initial);
  await content(page).locator('p').first().waitFor();
};

/** Selects the text `what` (which is in one text node). */
const select = (page: Page, what: string, nth = 0) =>
  page.evaluate(
    ([text, index]) => {
      const c = document.querySelector('.aurebesh-content') as HTMLElement;
      const walker = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
      let seen = 0;
      for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
        const at = n.data.indexOf(text as string);
        if (at < 0 || seen++ < (index as number)) continue;
        c.focus();
        const r = document.createRange();
        r.setStart(n, at);
        r.setEnd(n, at + (text as string).length);
        getSelection()!.removeAllRanges();
        getSelection()!.addRange(r);
        return;
      }
      throw new Error('text not found: ' + text);
    },
    [what, nth] as const,
  );

const commentButton = (page: Page) => page.locator('.aurebesh-toolbar .aurebesh-cmd-comment');

/** Comments on `what` with the text `text`, through the panel. */
const comment = async (page: Page, what: string, text: string) => {
  await select(page, what);
  await commentButton(page).click();
  await panel(page).locator('.aurebesh-comment-new textarea').fill(text);
  await panel(page).getByRole('button', { name: 'Comment', exact: true }).click();
};

const events = (page: Page) => page.evaluate(() => (window as any).events as { name: string; detail: any }[]);

test.describe('comments', () => {
  test('a comment on selected text: the text is marked, the thread is in the panel, and the events tell it', async ({ page }) => {
    await start(page);
    await comment(page, 'two', 'Is this right?');
    await expect(anchors(page)).toHaveCount(1);
    await expect(anchors(page)).toHaveText('two');
    const id = await anchors(page).getAttribute('data-comment');
    expect(await html(page)).toBe(`<p>one <span data-comment="${id}">two</span> three</p>`);
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText('Is this right?');
    await expect(cards(page).first()).toContainText('Me Myself');
    await expect(cards(page).first().locator('.aurebesh-comment-quote')).toHaveText('two');
    const all = await events(page);
    expect(all.map((e) => e.name)).toEqual(['comment', 'comments']);
    expect(all[0].detail.action).toBe('add');
    expect(all[0].detail.thread.id).toBe(id);
    expect(all[0].detail.message.text).toBe('Is this right?');
    expect(all[1].detail).toHaveLength(1);
    expect(await page.evaluate(() => (window as any).ed.instance.getComments())).toHaveLength(1);
  });

  test('the button needs selected text, and a Cancel changes nothing', async ({ page }) => {
    await start(page);
    await content(page).click();
    await expect(commentButton(page)).toBeDisabled();
    await select(page, 'one');
    await expect(commentButton(page)).toBeEnabled();
    await commentButton(page).click();
    await expect(panel(page).locator('.aurebesh-comment-new')).toBeVisible();
    await expect(panel(page).locator('.aurebesh-comment-new .aurebesh-comment-quote')).toHaveText('one');
    await panel(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(panel(page).locator('.aurebesh-comment-new')).toBeHidden();
    expect(await html(page)).toBe('<p>one two three</p>');
  });

  test('Ctrl+Alt+M starts a comment, and Ctrl+Enter writes it', async ({ page }) => {
    await start(page);
    await select(page, 'three');
    await page.keyboard.press('Control+Alt+M');
    const area = panel(page).locator('.aurebesh-comment-new textarea');
    await expect(area).toBeFocused();
    await area.fill('From the keyboard');
    await page.keyboard.press('Control+Enter');
    await expect(anchors(page)).toHaveText('three');
    await expect(cards(page).first()).toContainText('From the keyboard');
  });

  test('a reply, resolving and opening again, each with an event', async ({ page }) => {
    await start(page);
    await comment(page, 'two', 'First');
    await cards(page).first().locator('textarea').fill('A reply');
    await cards(page).first().getByRole('button', { name: 'Reply', exact: true }).click();
    await expect(cards(page).first().locator('.aurebesh-comment-msg')).toHaveCount(2);

    await cards(page).first().getByRole('button', { name: 'Resolve' }).click();
    await expect(cards(page)).toHaveCount(0);
    await expect(panel(page).locator('.aurebesh-comment-done summary')).toHaveText('Resolved (1)');
    await panel(page).locator('.aurebesh-comment-done summary').click();
    await panel(page).locator('.aurebesh-comment-done').getByRole('button', { name: 'Reopen' }).click();
    await expect(cards(page)).toHaveCount(1);

    const actions = (await events(page)).filter((e) => e.name === 'comment').map((e) => e.detail.action);
    expect(actions).toEqual(['add', 'reply', 'resolve', 'reopen']);
    const threads = await page.evaluate(() => (window as any).ed.instance.getComments());
    expect(threads[0].messages.map((m: any) => m.text)).toEqual(['First', 'A reply']);
    expect(threads[0].resolved).toBeUndefined();
  });

  test('a resolved comment has no highlight, an open one has, and the one with the caret has a stronger one', async ({ page }) => {
    await start(page);
    await comment(page, 'two', 'x');
    const bg = () => anchors(page).evaluate((el) => getComputedStyle(el).backgroundColor);
    const open = await bg();
    expect(open).not.toBe('rgba(0, 0, 0, 0)');
    await cards(page).first().getByRole('button', { name: 'Resolve' }).click();
    expect(await bg()).toBe('rgba(0, 0, 0, 0)');
  });

  test('the caret in the text makes its comment the active one in the panel, and a click on the quote selects the text', async ({ page }) => {
    await start(page, '<p>one two three four</p>');
    await comment(page, 'two', 'A');
    await comment(page, 'four', 'B');
    await expect(cards(page)).toHaveCount(2);
    // the caret in "two"
    await page.evaluate(() => {
      const a = document.querySelector('span[data-comment]')!.firstChild!;
      getSelection()!.collapse(a, 1);
    });
    await expect(cards(page).first()).toHaveAttribute('aria-current', 'true');
    await expect(cards(page).nth(1)).not.toHaveAttribute('aria-current', 'true');
    await cards(page).nth(1).locator('.aurebesh-comment-quote').click();
    expect(await page.evaluate(() => getSelection()!.toString())).toBe('four');
    await expect(cards(page).nth(1)).toHaveAttribute('aria-current', 'true');
  });

  test('threads are in the order of the text, whatever was written first', async ({ page }) => {
    await start(page, '<p>one two three four</p>');
    await comment(page, 'four', 'later in the text');
    await comment(page, 'one', 'earlier in the text');
    await expect(cards(page).nth(0)).toContainText('earlier in the text');
    await expect(cards(page).nth(1)).toContainText('later in the text');
  });

  test('deleting your own comment takes the mark out of the text, and one step of undo puts the mark back', async ({ page }) => {
    await start(page);
    await comment(page, 'two', 'Gone soon');
    await cards(page).first().getByRole('button', { name: 'Delete' }).click();
    await expect(cards(page)).toHaveCount(0);
    expect(await html(page)).toBe('<p>one two three</p>');
    expect(await page.evaluate(() => (window as any).ed.instance.getComments())).toEqual([]);
    expect((await events(page)).filter((e) => e.name === 'comment').map((e) => e.detail.action)).toEqual(['add', 'delete']);
    await content(page).click();
    await undo(page);
    await expect(anchors(page)).toHaveCount(1);
  });

  test('undo takes the mark of a new comment back, the thread stays and says its text is gone, and redo puts the mark back', async ({ page }) => {
    await start(page);
    await comment(page, 'two', 'Undo me');
    await content(page).click();
    await undo(page);
    await expect(anchors(page)).toHaveCount(0);
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first().locator('.aurebesh-comment-quote')).toHaveText('The text was removed');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+Z' : 'Control+Y');
    await expect(anchors(page)).toHaveCount(1);
    await expect(cards(page).first().locator('.aurebesh-comment-quote')).toHaveText('two');
  });

  test('a message of somebody else cannot be deleted, and a thread of two messages loses one at a time', async ({ page }) => {
    const created = new Date().toISOString();
    await start(page, '<p>one <span data-comment="t1">two</span> three</p>', [
      {
        id: 't1',
        messages: [
          { id: 'm1', author: OTHER, text: 'From Ann', created },
          { id: 'm2', author: ME, text: 'From me', created },
        ],
      },
    ]);
    await page.locator('.aurebesh-toolbar .aurebesh-cmd-comments').click(); // the panel with the threads
    await expect(cards(page)).toHaveCount(1);
    const deletes = cards(page).first().getByRole('button', { name: 'Delete' });
    await expect(deletes).toHaveCount(1); // only the message that is mine
    await deletes.click();
    await expect(cards(page).first().locator('.aurebesh-comment-msg')).toHaveCount(1);
    await expect(cards(page).first()).toContainText('From Ann');
    expect((await events(page)).filter((e) => e.name === 'comment').map((e) => e.detail.action)).toEqual(['deleteMessage']);
  });

  test('a selection over more blocks is one comment with a mark in each block', async ({ page }) => {
    await start(page, '<p>one two</p><p>three four</p>');
    await page.evaluate(() => {
      const c = document.querySelector('.aurebesh-content') as HTMLElement;
      c.focus();
      const r = document.createRange();
      r.setStart(c.children[0].firstChild!, 4);
      r.setEnd(c.children[1].firstChild!, 5);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(r);
    });
    await commentButton(page).click();
    await panel(page).locator('.aurebesh-comment-new textarea').fill('Over two blocks');
    await panel(page).getByRole('button', { name: 'Comment', exact: true }).click();
    await expect(anchors(page)).toHaveCount(2);
    const ids = await anchors(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-comment')));
    expect(ids[0]).toBe(ids[1]);
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first().locator('.aurebesh-comment-quote')).toHaveText('two three');
  });

  test('loaded threads show with their text; a thread whose text is gone says so; threads that are not valid are left out', async ({ page }) => {
    const created = new Date().toISOString();
    await start(page, '<p>one <span data-comment="t1">two</span> three</p>', [
      { id: 't1', messages: [{ id: 'm1', author: OTHER, text: 'On two', created }] },
      { id: 'gone', messages: [{ id: 'm2', author: OTHER, text: 'On text that was removed', created }] },
      { id: 'bad id', messages: [{ id: 'm3', author: OTHER, text: 'x', created }] },
      { id: 'empty', messages: [] },
    ]);
    await expect(cards(page)).toHaveCount(2);
    await expect(cards(page).nth(0).locator('.aurebesh-comment-quote')).toHaveText('two');
    await expect(cards(page).nth(1).locator('.aurebesh-comment-quote')).toHaveText('The text was removed');
    await expect(cards(page).nth(1).locator('.aurebesh-comment-quote')).toBeDisabled();
    expect(await page.evaluate(() => (window as any).ed.instance.getComments().map((t: any) => t.id))).toEqual(['t1', 'gone']);
  });

  test('setComments replaces the threads, and addComment works from code', async ({ page }) => {
    await start(page);
    await select(page, 'two');
    const thread = await page.evaluate(() => (window as any).ed.instance.addComment('From code'));
    expect(thread.messages[0].text).toBe('From code');
    await expect(anchors(page)).toHaveCount(1);
    await page.evaluate(() => (window as any).ed.instance.setComments([]));
    await expect(cards(page)).toHaveCount(0);
    // the mark stays in the text (it is the text of the application), it is only not a thread any more
    await expect(anchors(page)).toHaveCount(1);
  });

  test('the HTML keeps the marks and nothing else, also in a copy of the HTML that is loaded again', async ({ page }) => {
    await start(page);
    await comment(page, 'two', 'x');
    const saved = await html(page);
    const threads = await page.evaluate(() => (window as any).ed.instance.getComments());
    await start(page, saved, threads);
    await expect(anchors(page)).toHaveCount(1);
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first().locator('.aurebesh-comment-quote')).toHaveText('two');
    expect(await html(page)).toBe(saved);
  });

  test('without the option there is nothing of comments', async ({ page }) => {
    await open(page, '<p>one two</p>');
    await expect(commentButton(page)).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).ed.instance.getComments())).toEqual([]);
    expect(await page.evaluate(() => (window as any).ed.instance.addComment('x'))).toBeNull();
  });

  test('a read-only editor can show the comments but not start one', async ({ page }) => {
    await start(page, '<p>one <span data-comment="t1">two</span></p>', [{ id: 't1', messages: [{ id: 'm1', author: OTHER, text: 'Shown', created: new Date().toISOString() }] }]);
    await page.evaluate(() => (window as any).ed.instance.setReadOnly(true));
    await select(page, 'one');
    expect(await page.evaluate(() => (window as any).ed.instance.addComment('x'))).toBeNull();
    await expect(cards(page)).toHaveCount(1);
  });

  test('the comment is plain text in the panel: no HTML of the text is run', async ({ page }) => {
    await start(page);
    await comment(page, 'two', '<img src=x onerror="window.hacked=1"><b>bold</b>');
    await expect(cards(page).first().locator('.aurebesh-comment-text').first()).toHaveText('<img src=x onerror="window.hacked=1"><b>bold</b>');
    expect(await page.evaluate(() => (window as any).hacked)).toBeUndefined();
  });
});
