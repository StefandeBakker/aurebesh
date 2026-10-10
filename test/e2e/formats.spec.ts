import { test } from '@playwright/test';
import { expect, open } from './helpers';

const HTML = '<h1>Title</h1><p>a <strong>bold</strong> word</p><ul><li>one</li><li>two</li></ul>';

test.describe('output formats', () => {
  test('getMarkdown, getValue and the element getters give Markdown and plain text', async ({ page }) => {
    await open(page, HTML);
    const out = await page.evaluate(() => {
      const el = (window as any).ed;
      return { md: el.markdown, text: el.text, viaValue: el.instance.getValue('markdown'), html: el.instance.getValue() };
    });
    expect(out.md).toBe('# Title\n\na **bold** word\n\n- one\n- two');
    expect(out.viaValue).toBe(out.md);
    expect(out.text).toBe('Title\na bold word\none\ntwo');
    expect(out.html).toContain('<h1>Title</h1>');
  });

  test('the format attribute decides what a form submits, while value stays HTML', async ({ page }) => {
    await open(page, HTML);
    const submitted = (format: string | null) =>
      page.evaluate((f) => {
        const el = (window as any).ed as HTMLElement;
        if (f) el.setAttribute('format', f);
        else el.removeAttribute('format');
        const form = el.closest('form') ?? Object.assign(document.createElement('form'), {});
        if (!el.closest('form')) {
          el.replaceWith(form);
          form.appendChild(el);
        }
        return new FormData(form as HTMLFormElement).get('body');
      }, format);
    expect(await submitted('markdown')).toBe('# Title\n\na **bold** word\n\n- one\n- two');
    expect(await submitted('text')).toBe('Title\na bold word\none\ntwo');
    expect(String(await submitted(null))).toContain('<h1>Title</h1>');
    expect(await page.evaluate(() => (window as any).ed.value)).toContain('<h1>');
  });
});
