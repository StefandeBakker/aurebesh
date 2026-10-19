import { describe, expect, it } from 'vitest';
import { fromMarkdown, sanitize, toMarkdown } from '../src';

describe('the look of a strikethrough in the HTML', () => {
  it('keeps a double line and a colour on a strikethrough', () => {
    const html = '<s style="text-decoration-style: double; text-decoration-color: #dc2626">gone</s>';
    expect(sanitize(html)).toBe(html);
    expect(sanitize('<del style="text-decoration-color: rgb(220, 38, 38)">gone</del>')).toContain('text-decoration-color');
  });

  it('drops what a strikethrough should not have', () => {
    const out = sanitize('<s style="text-decoration-style: wavy; text-decoration-color: url(x); position: fixed; color: red">gone</s>');
    expect(out).toBe('<s>gone</s>');
  });

  it('does not give the styles to other tags', () => {
    expect(sanitize('<em style="text-decoration-style: double">x</em>')).toBe('<em>x</em>');
  });
});

describe('the look of a strikethrough in Markdown', () => {
  it('is ~~ for every look: Markdown has one kind of line', () => {
    expect(toMarkdown('<p><s style="text-decoration-style: double; text-decoration-color: #dc2626">gone</s> here</p>')).toBe('~~gone~~ here');
    expect(fromMarkdown('~~gone~~')).toBe('<p><del>gone</del></p>');
  });
});
