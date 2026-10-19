import { describe, expect, it } from 'vitest';
import { fromMarkdown, sanitize, toMarkdown } from '../src';

describe('a soft line break in the HTML', () => {
  it('stays a break in the block', () => {
    expect(sanitize('<p>one<br>two</p>')).toBe('<p>one<br>two</p>');
  });

  it('loses the break that a browser keeps at the end to show the caret', () => {
    expect(sanitize('<p>one<br><br></p>')).toBe('<p>one<br></p>');
    expect(sanitize('<p>one<br><br>two</p>')).toBe('<p>one<br><br>two</p>');
    expect(sanitize('<pre>one\n<br><br></pre>')).toContain('<pre>');
  });
});

describe('a soft line break in Markdown', () => {
  it('is two spaces and a new line in a paragraph, a list item and a quote', () => {
    expect(toMarkdown('<p>one<br>two</p>')).toBe('one  \ntwo');
    expect(toMarkdown('<ul><li>one<br>two</li></ul>')).toBe('- one  \n  two');
    expect(toMarkdown('<blockquote>one<br>two</blockquote>')).toBe('> one  \n> two');
  });

  it('is <br> in a heading and in a table cell, which have one line', () => {
    expect(toMarkdown('<h2>one<br>two</h2>')).toBe('## one<br>two');
    expect(toMarkdown('<table><tbody><tr><th>a<br>b</th></tr></tbody></table>')).toBe('| a<br>b |\n| --- |');
  });

  it('is read back: two spaces, a backslash and <br>', () => {
    expect(fromMarkdown('one  \ntwo')).toBe('<p>one<br>two</p>');
    expect(fromMarkdown('one\\\ntwo')).toBe('<p>one<br>two</p>');
    expect(fromMarkdown('## one<br>two')).toBe('<h2>one<br>two</h2>');
    expect(fromMarkdown('| a<br>b |\n| --- |')).toContain('a<br>b');
  });
});
