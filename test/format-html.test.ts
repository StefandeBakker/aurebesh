import { describe, expect, it } from 'vitest';
import { compactHtml, formatHtml } from '../src';

const SAMPLE = [
  '<h1>Title</h1>',
  '<p>Some <strong>bold</strong> text with a <a href="https://example.com">link</a> and&nbsp;a no-break space &amp; an ampersand.</p>',
  '<ul><li>one</li><li>two<ul><li>nested</li></ul></li></ul>',
  '<ul data-task=""><li data-checked="true">done</li><li>todo</li></ul>',
  '<div data-callout="tip"><p>A tip</p></div>',
  '<blockquote><p>Quote</p></blockquote>',
  '<table><tbody><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></tbody></table>',
  '<pre data-language="javascript">function a() {\n  return 1;\n}</pre>',
  '<hr>',
  '<p>Mention <span data-mention="ann">@Ann</span> and <span data-comment="c1">comment</span> and <span data-suggestion="s1" data-kind="insert">added</span></p>',
].join('');

describe('formatHtml', () => {
  it('puts each block on a line, and indents the blocks that are in a block', () => {
    expect(formatHtml('<h1>Title</h1><p>Text</p><ul><li>one</li><li>two</li></ul>')).toBe(['<h1>Title</h1>', '<p>Text</p>', '<ul>', '  <li>one</li>', '  <li>two</li>', '</ul>'].join('\n'));
  });

  it('indents a table, and a list in a list item, with the text of the item before it', () => {
    expect(formatHtml('<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>')).toBe(['<table>', '  <tbody>', '    <tr>', '      <td>a</td>', '      <td>b</td>', '    </tr>', '  </tbody>', '</table>'].join('\n'));
    expect(formatHtml('<ul><li>one<ul><li>in</li></ul></li></ul>')).toBe(['<ul>', '  <li>', '    one', '    <ul>', '      <li>in</li>', '    </ul>', '  </li>', '</ul>'].join('\n'));
  });

  it('does not touch the text in a block, or a code block', () => {
    const pre = '<pre>a\n  b\n\n    c</pre>';
    expect(formatHtml(pre)).toBe(pre);
    expect(formatHtml('<p>a  <em>b</em>\nc</p>')).toBe('<p>a  <em>b</em>\nc</p>');
  });

  it('keeps the attributes and the escaping, and no-break spaces', () => {
    const out = formatHtml('<p title="a &quot;b&quot;">x &lt; y&nbsp;z</p>');
    expect(out).toBe('<p title="a &quot;b&quot;">x &lt; y&nbsp;z</p>');
  });

  it('is empty for nothing, and text without a block is one line', () => {
    expect(formatHtml('')).toBe('');
    expect(formatHtml('just <b>text</b>')).toBe('just <b>text</b>');
  });
});

describe('compactHtml', () => {
  it('takes the line breaks and the indent between blocks away', () => {
    expect(compactHtml('<h1>Title</h1>\n<p>Text</p>\n<ul>\n  <li>one</li>\n  <li>two</li>\n</ul>')).toBe('<h1>Title</h1><p>Text</p><ul><li>one</li><li>two</li></ul>');
  });

  it('is the other way of formatHtml for every kind of content', () => {
    expect(compactHtml(formatHtml(SAMPLE))).toBe(compactHtml(SAMPLE));
    expect(compactHtml(formatHtml(SAMPLE))).toBe(new DOMParser().parseFromString(`<body>${SAMPLE}</body>`, 'text/html').body.innerHTML);
  });

  it('keeps the space inside a paragraph, around inline elements, and in a code block', () => {
    expect(compactHtml('<p>one <em>two</em> three</p>')).toBe('<p>one <em>two</em> three</p>');
    expect(compactHtml('<p>a\n  b</p>')).toBe('<p>a\n  b</p>');
    expect(compactHtml('<pre>x\n  y</pre>\n<p>z</p>')).toBe('<pre>x\n  y</pre><p>z</p>');
  });

  it('keeps a no-break space next to a block', () => {
    expect(compactHtml('<li>a&nbsp;<ul><li>b</li></ul></li>').includes('a&nbsp;')).toBe(true);
  });

  it('does what it can with HTML that is typed by hand: an uneven indent, blank lines, tabs', () => {
    expect(compactHtml('\n\n<p>a</p>\n\n\n\t<p>b</p>\n')).toBe('<p>a</p><p>b</p>');
  });

  it('is empty for nothing', () => {
    expect(compactHtml('')).toBe('');
  });
});
