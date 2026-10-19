import { describe, expect, it } from 'vitest';
import { fromMarkdown, sanitize, toMarkdown } from '../src';
import { shortcutFor, shortcutLabel } from '../src/shortcuts';

const key = (code: string, extra: KeyboardEventInit = {}) => new KeyboardEvent('keydown', { code, ctrlKey: true, ...extra });

describe('inline code in the HTML and Markdown', () => {
  it('keeps bold and links inside the code in the HTML, and writes plain text between backticks', () => {
    const html = '<p><code>a <strong>b</strong> <a href="https://x.dev">c</a></code></p>';
    expect(sanitize(html)).toBe(html);
    expect(toMarkdown(html)).toBe('`a b c`');
  });

  it('writes a backtick in the code with a longer fence, and reads it back', () => {
    expect(toMarkdown('<p><code>a`b</code></p>')).toBe('``a`b``');
    expect(fromMarkdown('``a`b``')).toBe('<p><code>a`b</code></p>');
  });

  it('has no attributes on code', () => {
    expect(sanitize('<p><code class="x" style="color: red" onclick="x()">a</code></p>')).toBe('<p><code>a</code></p>');
  });
});

describe('superscript and subscript in the HTML and Markdown', () => {
  it('are <sup> and <sub> both ways', () => {
    expect(toMarkdown('<p>x<sup>2</sup> H<sub>2</sub>O</p>')).toBe('x<sup>2</sup> H<sub>2</sub>O');
    expect(fromMarkdown('x<sup>2</sup> H<sub>2</sub>O')).toBe('<p>x<sup>2</sup> H<sub>2</sub>O</p>');
  });

  it('have the shortcuts Mod+. and Mod+, (and Cmd on a Mac)', () => {
    expect(shortcutFor(key('Period'))).toBe('sup');
    expect(shortcutFor(key('Comma'))).toBe('sub');
    expect(shortcutFor(key('Period', { ctrlKey: false, metaKey: true }))).toBe('sup');
    expect(shortcutFor(key('Period', { shiftKey: true }))).toBeNull();
    expect(shortcutLabel('sup')).toMatch(/\.$/);
    expect(shortcutLabel('sub')).toMatch(/,$/);
  });
});
