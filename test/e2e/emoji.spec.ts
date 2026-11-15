import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { content, expect, open, setHtml } from './helpers';

const toggle = (page: Page) => page.locator('.aurebesh-cmd-emoji');
const pop = (page: Page) => page.locator('.aurebesh-emoji-pop');
const search = (page: Page) => page.locator('.aurebesh-emoji-search');
const emoji = (page: Page, name: string) => pop(page).locator(`.aurebesh-emoji-btn[aria-label="${name}"]`).first();
const menu = (page: Page) => page.locator('.aurebesh-emoji-menu');
const text = (page: Page) => content(page).evaluate((el) => el.textContent ?? '');

test.describe('emoji', () => {
  test('are not loaded until they are used: not for an editor that has none of them in use', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await open(page);
    await expect(toggle(page)).toBeVisible();
    expect(requests.some((u) => /\/dist\/emoji-/.test(u))).toBe(false);
    await toggle(page).click();
    await expect(pop(page).locator('.aurebesh-emoji-btn').first()).toBeVisible({ timeout: 20_000 }); // a part of its own is fetched now
    expect(requests.some((u) => /\/dist\/emoji-/.test(u))).toBe(true);
  });

  test('the picker puts an emoji at the caret, and stays open for another', async ({ page }) => {
    await open(page);
    await content(page).click();
    await page.keyboard.type('Hi ');
    await toggle(page).click();
    await expect(search(page)).toBeFocused();
    await emoji(page, 'grinning face').click();
    await emoji(page, 'thumbs up').click();
    expect(await text(page)).toBe('Hi 😀👍');
    await expect(pop(page)).toBeVisible();
    await page.keyboard.type('!');
    expect(await text(page)).toBe('Hi 😀👍!');
  });

  test('the search finds by name and by word, in English and in Dutch, and Enter takes the first', async ({ page }) => {
    await open(page);
    await content(page).click();
    await toggle(page).click();
    await search(page).fill('duim');
    await expect(pop(page).locator('.aurebesh-emoji-btn').first()).toHaveText('👍');
    await search(page).fill('rocket');
    await expect(pop(page).locator('.aurebesh-emoji-btn').first()).toHaveText('🚀');
    await search(page).press('Enter');
    expect(await text(page)).toBe('🚀');
    await search(page).fill('zzzzzz');
    await expect(pop(page).locator('.aurebesh-emoji-none')).toBeVisible();
  });

  test('a skin tone is for the hands and the people, and the ones used last come first', async ({ page }) => {
    await open(page);
    await content(page).click();
    await toggle(page).click();
    await pop(page).locator('.aurebesh-emoji-tone').nth(3).click();
    await emoji(page, 'thumbs up').click();
    expect(await text(page)).toBe('👍\u{1F3FD}');
    await emoji(page, 'grinning face').click();
    expect(await text(page)).toBe('👍\u{1F3FD}😀');
    // the recent ones are a group on top
    await toggle(page).click();
    await toggle(page).click();
    await expect(pop(page).locator('section[data-group="recent"] .aurebesh-emoji-btn')).toHaveCount(2);
    await expect(pop(page).locator('section').first()).toHaveAttribute('data-group', 'recent');
  });

  test('the picker is used with the keyboard: arrows through the emoji, Enter, and Escape back to the button', async ({ page }) => {
    await open(page);
    await content(page).click();
    await toggle(page).click();
    await expect(search(page)).toBeFocused();
    await page.keyboard.press('ArrowDown'); // from the search box into the list
    await expect(pop(page).locator('.aurebesh-emoji-btn').first()).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    expect(await text(page)).toBe('😃'); // the text has the focus again, for typing on
    await toggle(page).click();
    await toggle(page).click();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await expect(pop(page)).toBeHidden();
    await expect(toggle(page)).toBeFocused();
  });

  test('a colon and two letters list the emoji; the arrow keys and Enter pick one', async ({ page }) => {
    await open(page);
    await content(page).click();
    await page.keyboard.type('Great :thumb');
    await expect(menu(page)).toBeVisible();
    await expect(menu(page).locator('[role="option"]').first()).toContainText('👍');
    await page.keyboard.press('Enter');
    expect(await text(page)).toBe('Great 👍');
    await expect(menu(page)).toBeHidden();
    await page.keyboard.type(' ok');
    expect(await text(page)).toBe('Great 👍 ok');
  });

  test('Escape closes the list and leaves what was typed', async ({ page }) => {
    await open(page);
    await content(page).click();
    await page.keyboard.type(':smi');
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu(page)).toBeHidden();
    expect(await text(page)).toBe(':smi');
  });

  test('the arrow keys move through the list', async ({ page }) => {
    await open(page);
    await content(page).click();
    await page.keyboard.type(':heart');
    await expect(menu(page)).toBeVisible();
    const first = await menu(page).locator('[role="option"]').nth(0).textContent();
    const second = await menu(page).locator('[role="option"]').nth(1).textContent();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    expect(await text(page)).toBe(second!.slice(0, second!.search(/[a-z]/i)).trim());
    expect(first).not.toBe(second);
  });

  test(':name: is the emoji as soon as the last colon is typed', async ({ page }) => {
    await open(page);
    await content(page).click();
    await page.keyboard.type('Done :thumbs_up:');
    await expect.poll(() => text(page)).toBe('Done 👍'); // the emoji are loaded by the first colon, so it can take a moment
    await expect(menu(page)).toBeHidden();
  });

  test('a colon in a sentence, or with one letter, does nothing', async ({ page }) => {
    await open(page);
    await content(page).click();
    await page.keyboard.type('Note: this and :a and 10:30 and a:bc');
    await expect(menu(page)).toBeHidden();
    expect(await text(page)).toBe('Note: this and :a and 10:30 and a:bc');
  });

  test('the slash menu has an Emoji item that starts the list', async ({ page }) => {
    await open(page);
    await page.evaluate(() => ((window as any).ed.options = { slash: true }));
    await content(page).click();
    await page.keyboard.type('/emoj');
    await page.keyboard.press('Enter');
    await expect(menu(page)).toBeVisible();
    await page.keyboard.type('rocke');
    await page.keyboard.press('Enter');
    await expect.poll(() => text(page)).toBe('🚀');
  });

  test('undo takes an emoji from a short code away again', async ({ page }) => {
    await open(page);
    await content(page).click();
    await page.keyboard.type('x :thumbs_up:');
    await expect.poll(() => text(page)).toBe('x 👍');
    await page.evaluate(() => (window as any).ed.instance.undo());
    expect(await text(page)).not.toContain('👍');
  });

  test('`emoji: false` has no short codes and no slash item, and an editor without the button has them too', async ({ page }) => {
    await open(page);
    await page.evaluate(() => ((window as any).ed.options = { emoji: false }));
    await content(page).click();
    await page.keyboard.type(':smile');
    await expect(menu(page)).toHaveCount(0);
    await page.keyboard.type(' ');
    await page.keyboard.type('/emoj');
    await expect(page.locator('.aurebesh-slash-item', { hasText: 'Emoji' })).toHaveCount(0);
  });

  test('a read-only editor does not take an emoji from a short code', async ({ page }) => {
    await open(page);
    await setHtml(page, '<p>fixed :smile</p>');
    await page.evaluate(() => (window as any).ed.instance.setReadOnly(true));
    await content(page).click();
    await expect(menu(page)).toBeHidden();
  });
});
