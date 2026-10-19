import { describe, expect, it } from 'vitest';
import { DEFAULT_CALLOUTS, calloutCss, sanitize, toMarkdown, fromMarkdown } from '../src';
import { normalizeCallouts } from '../src/callouts';

const dom = (html: string): HTMLElement => {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
};

describe('callouts in the HTML', () => {
  it('keeps the type of a callout and drops a type that is not a plain name', () => {
    expect(sanitize('<div data-callout="warning"><p>x</p></div>')).toBe('<div data-callout="warning"><p>x</p></div>');
    expect(sanitize('<div data-callout="a b"><p>x</p></div>')).not.toContain('data-callout');
    expect(sanitize('<div data-callout="x;}body{display:none"><p>x</p></div>')).not.toContain('data-callout');
    expect(sanitize('<div data-callout="Note"><p>x</p></div>')).not.toContain('data-callout');
  });

  it('does not let other attributes through on a callout', () => {
    const out = sanitize('<div data-callout="note" onclick="x()" class="c"><p>x</p></div>');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('class');
  });

  it('has CSS for every type, with a variable for the colour and one for the corners', () => {
    const css = calloutCss(DEFAULT_CALLOUTS);
    for (const { id } of DEFAULT_CALLOUTS) {
      expect(css).toContain(`[data-callout="${id}"]`);
      expect(css).toContain(`--aurebesh-callout-${id}`);
    }
    expect(css).toContain('--aurebesh-callout-radius');
  });

  it('leaves out a type with a name that would break out of the CSS', () => {
    const css = calloutCss([{ id: 'ok', color: '#123456' }, { id: 'a"]{}', color: 'red' }]);
    expect(css).toContain('[data-callout="ok"]');
    expect(css).not.toContain('a"]{}');
  });

  it('gives an empty callout a paragraph, and a paragraph before and after one', () => {
    const root = dom('<div data-callout="tip"></div>');
    normalizeCallouts(root);
    expect(root.innerHTML).toBe('<p data-guard=""><br></p><div data-callout="tip"><p><br></p></div><p data-guard=""><br></p>');
    // the paragraphs beside it are only there to type in: they do not go out
    expect(sanitize(root.innerHTML)).toBe('<div data-callout="tip"><p><br></p></div>');
  });
});

describe('callouts in Markdown', () => {
  it('writes a callout as an alert and reads it back', () => {
    const md = toMarkdown('<div data-callout="warning"><p>Be <strong>careful</strong></p><p>Second</p></div>');
    expect(md).toBe('> [!WARNING]\n> Be **careful**\n>\n> Second');
    const html = fromMarkdown(md);
    expect(html).toContain('<div data-callout="warning">');
    expect(html).toContain('<strong>careful</strong>');
    expect(toMarkdown(html)).toBe(md);
  });

  it('keeps an ordinary quote a quote, and an empty alert an empty callout', () => {
    expect(fromMarkdown('> just a quote')).toContain('<blockquote>');
    expect(fromMarkdown('> [!NOTE]')).toContain('<div data-callout="note"><p><br></p></div>');
  });
});
