import { describe, expect, it } from 'vitest';
import { sanitize } from '../src';

describe('the size of text in the HTML', () => {
  it('keeps sizes in points and pixels on a span, and the names of the older steps', () => {
    for (const size of ['14pt', '9pt', '10.5pt', '72pt', '18px', 'x-large', 'small']) {
      const html = `<p><span style="font-size: ${size}">a</span></p>`;
      expect(sanitize(html), size).toBe(html);
    }
  });

  it('drops a size that is too small or too big, or in other units', () => {
    for (const size of ['2pt', '500pt', '500px', '1.5em', '120%', 'larger', 'calc(1px + 2pt)']) {
      expect(sanitize(`<p><span style="font-size: ${size}">a</span></p>`), size).toBe('<p>a</p>');
    }
  });

  it('keeps sizes on spans only', () => {
    expect(sanitize('<p><em style="font-size: 14pt">a</em></p>')).toBe('<p><em>a</em></p>');
  });
});
