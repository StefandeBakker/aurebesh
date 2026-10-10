import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Opens the test page and waits until the editor has rendered. `setup` runs in the page before the editor is created. */
export async function open(page: Page, initialHtml?: string): Promise<void> {
  await page.goto('/test/e2e/page.html');
  await page.locator('.aurebesh-content').waitFor();
  if (initialHtml !== undefined) await setHtml(page, initialHtml);
}

export const content = (page: Page) => page.locator('.aurebesh-content');

export const html = (page: Page): Promise<string> => page.evaluate(() => document.querySelector('.aurebesh-content')!.innerHTML);

export async function setHtml(page: Page, value: string): Promise<void> {
  await page.evaluate((v) => (window as any).ed.instance.setHTML(v), value);
}

/** Types text into the editor like a person: click, then the keyboard. */
export async function type(page: Page, text: string): Promise<void> {
  await content(page).click();
  await page.keyboard.type(text);
}

export const selectAll = async (page: Page) => {
  await content(page).focus();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
};

export const undo = (page: Page) => page.keyboard.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z');

/** A toolbar button by its tooltip text. */
export const button = (page: Page, title: string) => page.locator(`.aurebesh-toolbar button[title="${title}"]`).first();

/** Puts the caret at the end of the last block, as if clicked there. */
export async function caretToEnd(page: Page): Promise<void> {
  await content(page).focus();
  await page.evaluate(() => {
    const c = document.querySelector('.aurebesh-content')!;
    const last = c.lastElementChild ?? c;
    const r = document.createRange();
    r.selectNodeContents(last);
    r.collapse(false);
    const s = getSelection()!;
    s.removeAllRanges();
    s.addRange(r);
  });
}

export { expect };

/** 1x1 red PNG. */
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8Dwn4EIwDiqkL4KAcT9GO0U4BxoAAAAAElFTkSuQmCC',
  'base64',
);
