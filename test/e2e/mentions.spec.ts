import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { content, expect, open, type, undo } from './helpers';

const menu = (page: Page) => page.locator('.aurebesh-mention-menu');
const options = (page: Page) => menu(page).locator('.aurebesh-slash-item');
const chips = (page: Page) => content(page).locator('span[data-mention]');
const html = (page: Page): Promise<string> => page.evaluate(() => (window as any).ed.instance.getHTML());

/** An editor with mentions: three people, found by a part of the name. `search` can be replaced to try an asynchronous one. */
const start = async (page: Page, initial = '<p><br></p>', search = '') => {
  await open(page);
  await page.evaluate((s) => {
    const people = [
      { id: 'ann', name: 'Ann Smith', description: 'ann@example.com' },
      { id: 'anton', name: 'Anton Berg' },
      { id: 'bo', name: 'Bo Li' },
    ];
    const w = window as any;
    w.mentioned = [];
    w.ed.addEventListener('mention', (e: CustomEvent) => w.mentioned.push(e.detail));
    w.ed.options = {
      mentions: {
        search: s ? new Function('people', 'return ' + s)(people) : (q: string) => people.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())),
      },
    };
  }, search);
  await content(page).waitFor();
  await page.evaluate((v) => (window as any).ed.instance.setHTML(v), initial);
  await content(page).locator('p, pre').first().waitFor();
};

test.describe('mentions', () => {
  test('@ opens the list, what is typed narrows it, Enter makes a chip and the text goes on after it', async ({ page }) => {
    await start(page);
    await type(page, '@');
    await expect(menu(page)).toBeVisible();
    await expect(options(page)).toHaveCount(3);
    await expect(options(page).first()).toContainText('ann@example.com'); // the second line
    await page.keyboard.type('an');
    await expect(options(page)).toHaveCount(2);
    await page.keyboard.press('Enter');
    await expect(menu(page)).toBeHidden();
    await expect(chips(page)).toHaveCount(1);
    await expect(chips(page)).toHaveText('@Ann Smith');
    await page.keyboard.type('hello');
    expect(await html(page)).toMatch(/^<p><span data-mention="ann">@Ann Smith<\/span>(?:&nbsp;| )hello<\/p>$/);
  });

  test('the HTML keeps the mention without anything of the editor, and the chip in the text is one piece', async ({ page }) => {
    await start(page);
    await type(page, 'Hi @bo');
    await page.keyboard.press('Enter');
    expect(await html(page)).not.toContain('contenteditable');
    await expect(chips(page)).toHaveAttribute('contenteditable', 'false');
    // Backspace takes the space, and the next one the whole chip
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect(chips(page)).toHaveCount(0);
    expect(await html(page)).toMatch(/^<p>Hi(?:&nbsp;| )<\/p>$/);
  });

  test('the arrow keys move in the list, a click picks, Escape closes it and leaves the text as it is', async ({ page }) => {
    await start(page);
    await type(page, '@');
    await page.keyboard.press('ArrowDown');
    await expect(options(page).nth(1)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');
    await expect(chips(page)).toHaveText('@Anton Berg');

    await page.keyboard.type(' @');
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu(page)).toBeHidden();
    await expect(chips(page)).toHaveCount(1);

    await page.keyboard.press('Backspace'); // the @ that stayed
    await page.keyboard.type('@bo');
    await options(page).first().click();
    await expect(chips(page)).toHaveCount(2);
    await expect(chips(page).nth(1)).toHaveText('@Bo Li');
  });

  test('the list closes when nobody is found, and when the caret leaves the text after the @', async ({ page }) => {
    await start(page);
    await type(page, '@zzz');
    await expect(menu(page)).toBeHidden();
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('@an');
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(menu(page)).toBeHidden();
  });

  test('an @ in the middle of a word (an address) does not open the list, and neither does one in code', async ({ page }) => {
    await start(page);
    await type(page, 'mail me: name@');
    await expect(menu(page)).toBeHidden();
    await start(page, '<pre>code</pre>');
    await content(page).locator('pre').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' @');
    await expect(menu(page)).toBeHidden();
  });

  test('a read-only editor has no list', async ({ page }) => {
    await start(page);
    await type(page, '@');
    await expect(menu(page)).toBeVisible();
    await page.evaluate(() => (window as any).ed.instance.setReadOnly(true));
    await expect(menu(page)).toBeHidden();
  });

  test('the event tells who was picked, and getMentions() lists who is in the text, each once', async ({ page }) => {
    await start(page);
    await type(page, '@ann');
    await page.keyboard.press('Enter');
    await page.keyboard.type('and @bo');
    await page.keyboard.press('Enter');
    await page.keyboard.type('and @ann');
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => (window as any).mentioned.map((u: any) => u.id))).toEqual(['ann', 'bo', 'ann']);
    expect(await page.evaluate(() => (window as any).ed.instance.getMentions())).toEqual([
      { id: 'ann', name: 'Ann Smith' },
      { id: 'bo', name: 'Bo Li' },
    ]);
  });

  test('one step of undo takes the chip back (with the space after it)', async ({ page }) => {
    await start(page);
    await type(page, 'x @bo');
    await page.keyboard.press('Enter');
    await expect(chips(page)).toHaveCount(1);
    await undo(page);
    await undo(page);
    await expect(chips(page)).toHaveCount(0);
  });

  test('a mention that is loaded or pasted is a chip too; an id that is not a plain name is dropped', async ({ page }) => {
    await start(page);
    await page.evaluate(() => (window as any).ed.instance.setHTML('<p>Hi <span data-mention="ann">@Ann Smith</span> <span data-mention="a b&quot;&gt;">@x</span></p>'));
    await expect(chips(page)).toHaveCount(1);
    await expect(chips(page)).toHaveAttribute('contenteditable', 'false');
    expect(await html(page)).toBe('<p>Hi <span data-mention="ann">@Ann Smith</span> @x</p>');
  });

  test('a mention that is pasted stays a mention, without the look of where it came from', async ({ page }) => {
    await start(page, '<p>Hi </p>');
    await content(page).click();
    await page.keyboard.press('End');
    await page.evaluate(() =>
      (window as any).__paste({ html: '<p>Yo <span data-mention="ann" style="color: rgb(37, 99, 235);">@Ann</span></p>', text: 'Yo @Ann' }),
    );
    await expect(chips(page)).toHaveCount(1);
    await expect(chips(page)).toHaveAttribute('contenteditable', 'false');
    expect(await html(page)).toContain('<span data-mention="ann">@Ann</span>');
  });

  test('a slow search does not overwrite a newer one', async ({ page }) => {
    // the first question takes long to answer, the second is quick: the list shows the answer of the second
    await start(
      page,
      '<p><br></p>',
      `(q) => new Promise((resolve) => setTimeout(() => resolve(q === '' ? [{ id: 'old', name: 'Old answer' }] : [{ id: 'new', name: 'New answer' }]), q === '' ? 400 : 20))`,
    );
    await type(page, '@');
    await page.keyboard.type('n');
    await expect(options(page)).toHaveCount(1);
    await expect(options(page).first()).toContainText('New answer');
    await page.waitForTimeout(600);
    await expect(options(page).first()).toContainText('New answer');
  });

  test('the list is a listbox that the text area points to', async ({ page }) => {
    await start(page);
    await type(page, '@');
    await expect(menu(page)).toHaveAttribute('role', 'listbox');
    const active = await content(page).getAttribute('aria-activedescendant');
    await expect(page.locator(`#${active}`)).toHaveAttribute('aria-selected', 'true');
    await expect(content(page)).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(content(page)).not.toHaveAttribute('aria-expanded', 'true');
  });
});
