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

describe('a sanitized copy of an element', () => {
  const samples = [
    '<h1>Title</h1><p>Some <strong>bold</strong> <em>italic</em> and a <a href="https://example.com/" onclick="x()">link</a></p>',
    '<ul><li>one<ul><li>nested</li></ul></li></ul><ol><li>a</li></ol><ul data-task><li data-checked="true">done</li></ul>',
    '<table><colgroup><col style="width: 50%"></colgroup><tbody><tr><th>A</th><td colspan="2" style="background-color: #ff0000">B</td></tr></tbody></table>',
    '<p onclick="x()" style="color: red; position: fixed">styled</p><script>alert(1)</script><img src="javascript:alert(1)"><iframe src="https://evil.example"></iframe>',
    '<div data-callout="warning"><p>text</p></div><p data-guard=""><br></p><pre data-language="js">a\n  b</pre>',
    '<p>a<br><br></p><p><span data-mention="ann" contenteditable="false">@Ann</span> <span data-comment="c1">x</span> <span data-suggestion="s1" data-kind="insert" data-author="a" data-name="A" data-date="2026-10-22T09:00:00.000Z">y</span></p>',
    '<blockquote><p>q</p></blockquote><hr><p style="text-align: center">c</p>',
  ];

  it('is the same as the sanitizer gives for the HTML of that element', async () => {
    const { sanitize, sanitizeNodes } = await import('../src/sanitize');
    for (const html of samples) {
      const box = document.createElement('div');
      box.innerHTML = html;
      expect(sanitizeNodes(box).innerHTML, html).toBe(sanitize(box.innerHTML));
    }
  });

  it('leaves the element as it was, and does not load a picture or run a script while it works', async () => {
    const { sanitizeNodes } = await import('../src/sanitize');
    const box = document.createElement('div');
    box.innerHTML = '<p onclick="x()">a</p><img src="https://evil.example/x.png" onerror="window.__ran = true">';
    const before = box.innerHTML;
    const copy = sanitizeNodes(box);
    expect(box.innerHTML).toBe(before);
    expect(copy.ownerDocument).not.toBe(document);
    expect(copy.innerHTML).toBe('<p>a</p><img src="https://evil.example/x.png">'); // the picture stays (it is allowed), its script does not
    expect((window as unknown as { __ran?: boolean }).__ran).toBeUndefined();
  });

  it('gives the text as it reads when the suggestions are accepted, on a copy', async () => {
    const { finalNode } = await import('../src/suggestions');
    const box = document.createElement('div');
    box.innerHTML = '<p>a <span data-suggestion="s1" data-kind="delete">x</span><span data-suggestion="s1" data-kind="insert">y</span> b</p>';
    expect(finalNode(box).innerHTML).toBe('<p>a y b</p>');
  });
});
