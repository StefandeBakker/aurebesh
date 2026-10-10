import { describe, expect, it } from 'vitest';
import { toMarkdown, toText } from '../src/export';

describe('toMarkdown', () => {
  it('converts headings, paragraphs and inline formatting', () => {
    expect(toMarkdown('<h1>Title</h1><p>a <strong>bold</strong> and <em>it</em> and <s>gone</s> and <code>x</code></p>')).toBe(
      '# Title\n\na **bold** and *it* and ~~gone~~ and `x`',
    );
  });
  it('keeps the spaces outside the markers', () => {
    expect(toMarkdown('<p>a<b> bold </b>b</p>')).toBe('a **bold** b');
  });
  it('converts links and images, and keeps underline / sub / sup as HTML', () => {
    expect(toMarkdown('<p><a href="https://e.com/a b">go</a> <img src="/i.png" alt="pic"> <u>u</u> x<sup>2</sup></p>')).toBe(
      '[go](https://e.com/a%20b) ![pic](/i.png) <u>u</u> x<sup>2</sup>',
    );
  });
  it('converts nested lists', () => {
    expect(toMarkdown('<ul><li>one<ul><li>inner</li></ul></li><li>two</li></ul><ol start="3"><li>x</li><li>y</li></ol>')).toBe(
      '- one\n  - inner\n- two\n\n3. x\n4. y',
    );
  });
  it('converts quotes, rules and code blocks (with backticks inside)', () => {
    expect(toMarkdown('<blockquote><p>q1</p><p>q2</p></blockquote><hr><pre>a\n```\nb</pre>')).toBe('> q1\n>\n> q2\n\n---\n\n````\na\n```\nb\n````');
  });
  it('converts a table to GFM with the first row as header', () => {
    expect(toMarkdown('<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>a|b</td></tr></table>')).toBe('| A | B |\n| --- | --- |\n| 1 | a\\|b |');
  });
  it('escapes characters Markdown would read as formatting', () => {
    expect(toMarkdown('<p>2 * 3 = _six_ [x]</p><p>- not a list</p>')).toBe('2 \\* 3 = \\_six\\_ \\[x\\]\n\n\\- not a list');
  });
  it('turns <br> into a hard break and drops colours and columns', () => {
    expect(toMarkdown('<div style="column-count:2"><p style="color:red">a<br>b</p></div>')).toBe('a  \nb');
  });
});

describe('toText', () => {
  it('gives plain text', () => {
    expect(toText('<h1>T</h1><p>a <b>b</b></p>')).toBe('T\na b');
  });
});
