import { describe, expect, it } from 'vitest';
import { toMarkdown } from '../src';
import { toDocxBytes } from '../src/docx';
import { unzipAll } from '../src/zip';
import { finalHtml } from '../src/suggestions';

describe('HTML that is given to the conversions as it is', () => {
  it('leaves out what belongs in the head of a page (a style, a title, a meta tag) instead of making text of it', () => {
    expect(toMarkdown('<style>a{color:red}</style><p>x</p>')).toBe('x');
    expect(toMarkdown('<title>t</title><p>x</p>')).toBe('x');
    expect(toMarkdown('<meta charset="utf-8"><p>x</p>')).toBe('x');
  });

  it('keeps the text, the inline formatting and the white space inside a block', () => {
    expect(toMarkdown('<p>one <b>two</b>  three</p>')).toBe('one **two** three');
    expect(toMarkdown('plain <i>text</i>')).toBe('plain *text*');
  });

  it('is the same for a Word file and for the text that accepts the suggestions', async () => {
    const files = await unzipAll(await toDocxBytes('<style>a{}</style><p>Hello <b>there</b></p>'));
    const xml = new TextDecoder().decode(files.get('word/document.xml'));
    expect(xml).toContain('Hello ');
    expect(xml).not.toContain('a{}');
    expect(finalHtml('<p>a <span data-suggestion="s1" data-kind="delete">x</span>b</p>')).toBe('<p>a b</p>');
  });
});
