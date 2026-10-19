import { describe, expect, it } from 'vitest';
import { sanitize, toMarkdown } from '../src';

describe('the weight of text in the HTML', () => {
  it('keeps the weights between regular and bold on a span', () => {
    for (const w of ['300', '400', '500', '600']) {
      const html = `<p><span style="font-weight: ${w}">text</span></p>`;
      expect(sanitize(html)).toBe(html);
    }
  });

  it('drops a weight that is not one of those, and a weight on a tag that is not a span', () => {
    expect(sanitize('<p><span style="font-weight: 900">text</span></p>')).toBe('<p>text</p>');
    expect(sanitize('<p><span style="font-weight: bolder">text</span></p>')).toBe('<p>text</p>');
    expect(sanitize('<p><em style="font-weight: 300">text</em></p>')).toBe('<p><em>text</em></p>');
  });

  it('is plain text in Markdown, and bold stays **bold**', () => {
    expect(toMarkdown('<p><span style="font-weight: 300">light</span> <strong>bold</strong></p>')).toBe('light **bold**');
  });
});
