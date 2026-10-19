import { describe, expect, it, vi } from 'vitest';
import { Aurebesh, fromMarkdown, sanitize, toMarkdown } from '../src';
import { markdownToHtml, textToHtml } from '../src/from-markdown';
import { defineAurebeshElement } from '../src/element';

const html = (md: string) => markdownToHtml(md);

describe('Markdown to HTML: blocks', () => {
  it('reads headings (hash and underline) and caps them at the three levels the editor has', () => {
    expect(html('# One\n\n## Two\n\n### Three')).toBe('<h1>One</h1><h2>Two</h2><h3>Three</h3>');
    expect(html('#### Four\n\n###### Six')).toBe('<h3>Four</h3><h3>Six</h3>');
    expect(html('Title\n=====\n\nSub\n---')).toBe('<h1>Title</h1><h2>Sub</h2>');
    expect(html('## Closed ##')).toBe('<h2>Closed</h2>');
    expect(html('#NoSpace')).toBe('<p>#NoSpace</p>');
  });

  it('reads paragraphs, line breaks and soft breaks', () => {
    expect(html('one\n\ntwo')).toBe('<p>one</p><p>two</p>');
    expect(html('a  \nb')).toBe('<p>a<br>b</p>');
    expect(html('a\\\nb')).toBe('<p>a<br>b</p>');
    expect(html('a\nb')).toBe('<p>a\nb</p>');
  });

  it('reads fenced and indented code blocks as they are, with nothing read as markup in them', () => {
    expect(html('```js\nconst a = <b>1</b> * 2;\n```')).toBe('<pre>const a = &lt;b&gt;1&lt;/b&gt; * 2;</pre>');
    expect(html('~~~\nx\n~~~')).toBe('<pre>x</pre>');
    expect(html('````\n```\ninner\n```\n````')).toBe('<pre>```\ninner\n```</pre>');
    expect(html('    indented\n    code')).toBe('<pre>indented\ncode</pre>');
    expect(html('```\nnever closed')).toBe('<pre>never closed</pre>');
  });

  it('reads quotes, also nested and with other blocks inside', () => {
    expect(html('> one\n> two')).toBe('<blockquote><p>one\ntwo</p></blockquote>');
    expect(html('> a\n>\n> b')).toBe('<blockquote><p>a</p><p>b</p></blockquote>');
    expect(html('> outer\n> > inner')).toBe('<blockquote><p>outer</p><blockquote><p>inner</p></blockquote></blockquote>');
    expect(html('> # Head\n> - item')).toBe('<blockquote><h1>Head</h1><ul><li>item</li></ul></blockquote>');
  });

  it('reads horizontal lines, and does not mix them up with lists or headings', () => {
    expect(html('a\n\n---\n\nb')).toBe('<p>a</p><hr><p>b</p>');
    expect(html('***')).toBe('<hr>');
    expect(html('- - -')).toBe('<hr>');
  });

  it('reads bullet and numbered lists, nested, tight and loose', () => {
    expect(html('- one\n- two\n  - nested\n- three')).toBe('<ul><li>one</li><li>two<ul><li>nested</li></ul></li><li>three</li></ul>');
    expect(html('1. a\n2. b\n   1. c')).toBe('<ol><li>a</li><li>b<ol><li>c</li></ol></li></ol>');
    expect(html('* a\n+ b')).toBe('<ul><li>a</li></ul><ul><li>b</li></ul>'); // another marker is another list
    expect(html('- a\n\n- b')).toBe('<ul><li><p>a</p></li><li><p>b</p></li></ul>'); // loose
    expect(html('- a\n  more\nlazy')).toBe('<ul><li>a\nmore\nlazy</li></ul>');
    expect(html('- item\n\n  second paragraph')).toBe('<ul><li><p>item</p><p>second paragraph</p></li></ul>');
    expect(html('- ```\n  code\n  ```')).toBe('<ul><li><pre>code</pre></li></ul>');
    expect(html('10. ten')).toBe('<ol><li>ten</li></ol>');
    expect(html('1986\\. A great year')).toBe('<p>1986. A great year</p>');
  });

  it('reads tables, with their alignment, escaped pipes and short rows', () => {
    expect(html('| a | b |\n|---|---|\n| 1 | 2 |')).toBe('<table><tbody><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></tbody></table>');
    expect(html('a | b\n:-:|--:\nx | y')).toBe(
      '<table><tbody><tr><th style="text-align: center">a</th><th style="text-align: right">b</th></tr><tr><td style="text-align: center">x</td><td style="text-align: right">y</td></tr></tbody></table>',
    );
    expect(html('| a | b |\n|---|---|\n| 1 \\| 2 |')).toBe('<table><tbody><tr><th>a</th><th>b</th></tr><tr><td>1 | 2</td><td></td></tr></tbody></table>');
    expect(html('| a | b |\n|---|\n| 1 | 2 |')).toBe('<p>| a | b |\n|---|\n| 1 | 2 |</p>'); // the delimiter row must have as many columns
  });

  it('lets a block of raw HTML through, for the sanitizer to judge', () => {
    expect(html('<div>\nblock\n</div>')).toBe('<div>\nblock\n</div>');
  });
});

describe('Markdown to HTML: inline', () => {
  it('reads emphasis, strong, both and strikethrough', () => {
    expect(html('*a* _b_ **c** __d__ ***e*** ~~f~~')).toBe('<p><em>a</em> <em>b</em> <strong>c</strong> <strong>d</strong> <em><strong>e</strong></em> <del>f</del></p>');
    expect(html('**a *b* c**')).toBe('<p><strong>a <em>b</em> c</strong></p>');
    expect(html('snake_case_word and 2*3*4')).toBe('<p>snake_case_word and 2<em>3</em>4</p>');
    expect(html('* not emphasis *')).toBe('<ul><li>not emphasis *</li></ul>');
    expect(html('a * b * c')).toBe('<p>a * b * c</p>');
    expect(html('**unclosed')).toBe('<p>**unclosed</p>');
  });

  it('reads code spans, with the backticks and spaces the way CommonMark does', () => {
    expect(html('`a` and ``b ` c``')).toBe('<p><code>a</code> and <code>b ` c</code></p>');
    expect(html('` x `')).toBe('<p><code>x</code></p>');
    expect(html('`*not em*` <b>')).toBe('<p><code>*not em*</code> <b></p>');
  });

  it('reads links of every kind and images', () => {
    expect(html('[a](https://x.com)')).toBe('<p><a href="https://x.com">a</a></p>');
    expect(html('[a](https://x.com "Title")')).toBe('<p><a href="https://x.com" title="Title">a</a></p>');
    expect(html('[a](<https://x.com/a b>)')).toBe('<p><a href="https://x.com/a b">a</a></p>');
    expect(html('[a](https://x.com/(b))')).toBe('<p><a href="https://x.com/(b)">a</a></p>');
    expect(html('[*a*](u)')).toBe('<p><a href="u"><em>a</em></a></p>');
    expect(html('![alt *text*](a.png "T")')).toBe('<p><img src="a.png" alt="alt *text*" title="T"></p>');
    expect(html('<https://x.com> and <me@x.com>')).toBe('<p><a href="https://x.com">https://x.com</a> and <a href="mailto:me@x.com">me@x.com</a></p>');
    expect(html('see https://x.com/a_b. And www.x.com!')).toBe('<p>see <a href="https://x.com/a_b">https://x.com/a_b</a>. And <a href="http://www.x.com">www.x.com</a>!</p>');
    expect(html('[not a link] and [a][r]\n\n[r]: https://r.com "R"')).toBe('<p>[not a link] and <a href="https://r.com" title="R">a</a></p>');
    expect(html('[Ref][] and [ref]\n\n[ref]: /x')).toBe('<p><a href="/x">Ref</a> and <a href="/x">ref</a></p>');
  });

  it('reads backslash escapes, entities and HTML that Markdown allows in text', () => {
    expect(html('\\*a\\* \\# \\[b\\] \\\\')).toBe('<p>*a* # [b] \\</p>');
    expect(html('a &amp; b &copy; &lt; & c')).toBe('<p>a &amp; b &copy; &lt; &amp; c</p>');
    expect(html('x <u>under</u> y<sub>2</sub> z<sup>3</sup>')).toBe('<p>x <u>under</u> y<sub>2</sub> z<sup>3</sup></p>');
    expect(html('1 < 2 and 3 > 2')).toBe('<p>1 &lt; 2 and 3 &gt; 2</p>');
    expect(html('a <!-- hidden --> b')).toBe('<p>a  b</p>');
  });
});

describe('Markdown to sanitized HTML', () => {
  it('keeps nothing unsafe, whatever the Markdown holds', () => {
    const attack = [
      '<script>alert(1)</script>',
      '[x](javascript:alert(1))',
      '![x](javascript:alert(1))',
      '<img src=x onerror="alert(1)">',
      '<a href="javascript:alert(1)" onclick="x()">y</a>',
      '<iframe src="https://evil.example"></iframe>',
      '<div style="position:fixed">z</div>',
    ].join('\n\n');
    const out = fromMarkdown(attack);
    expect(out).not.toMatch(/script|javascript:|onerror|onclick|iframe|position/i);
    expect(out).toContain('<a>x</a>'); // the link stays, without its address
  });

  it('is the same as sanitizing what markdownToHtml gives', () => {
    const md = '# T\n\n- a\n- b\n\n**x** <u>u</u>';
    expect(fromMarkdown(md)).toBe(sanitize(markdownToHtml(md)));
  });
});

describe('plain text to HTML', () => {
  it('makes paragraphs of blocks and line breaks of lines, and reads nothing as markup', () => {
    expect(textToHtml('one\ntwo\n\nthree <b> & *four*')).toBe('<p>one<br>two</p><p>three &lt;b&gt; &amp; *four*</p>');
    expect(textToHtml('')).toBe('');
  });
});

describe('round trips', () => {
  /** Markdown that the editor writes itself: reading and writing it again changes nothing. */
  const CANONICAL = [
    '# Title\n\nA paragraph with **strong**, *emphasis*, ~~strike~~ and `code`.',
    '## Lists\n\n- one\n- two\n  - nested\n- three\n\n1. first\n2. second',
    '> a quote\n>\n> and a second paragraph',
    '```\nfunction a() {\n  return 1;\n}\n```',
    '| a | b |\n| --- | --- |\n| 1 | 2 |',
    '| a | b | c |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |',
    '[a link](https://example.com) and ![an image](https://example.com/a.png)',
    'line one  \nline two',
    'text with <u>underline</u> and H<sub>2</sub>O and x<sup>2</sup>',
    'escaped \\*stars\\* and a\\_b\n\n\\# not a heading',
    '---',
  ];
  it.each(CANONICAL)('Markdown, HTML, Markdown: %s', (md) => {
    expect(toMarkdown(fromMarkdown(md))).toBe(md);
  });

  /** HTML of the editor: the Markdown of it reads back as the same HTML. */
  const EDITOR_HTML = [
    '<h1>Title</h1><p>Text <strong>b</strong> <em>i</em> <del>s</del> <code>c</code></p>',
    '<ul><li>a</li><li>b<ul><li>c</li></ul></li></ul><ol><li>one</li><li>two</li></ol>',
    '<blockquote><p>quote</p></blockquote><hr><p>after</p>',
    '<pre>line 1\nline 2</pre>',
    '<table><tbody><tr><th>h1</th><th style="text-align: right">h2</th></tr><tr><td>a</td><td style="text-align: right">b</td></tr></tbody></table>',
    '<p><a href="https://example.com" title="T">link</a> <img src="https://example.com/a.png" alt="alt"></p>',
    '<p>a<br>b</p>',
  ];
  it.each(EDITOR_HTML)('HTML, Markdown, HTML: %s', (h) => {
    const back = fromMarkdown(toMarkdown(h));
    expect(back).toBe(sanitize(h));
  });

  it('loses only what Markdown cannot say (colour, font, size, alignment of text, columns, video, indent)', () => {
    const rich = '<p style="text-align: center; margin-inline-start: 24px"><span style="color: red; font-size: large">x</span></p>';
    expect(toMarkdown(sanitize(rich))).toBe('x');
    expect(toMarkdown('<video src="https://example.com/a.mp4" controls></video>')).toBe('[https://example.com/a.mp4](https://example.com/a.mp4)');
  });
});

describe('the editor', () => {
  const make = (o: object = {}) => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    return new Aurebesh(el, o);
  };

  it('sets its content from Markdown, with setMarkdown and with setValue', () => {
    const ed = make();
    ed.setMarkdown('# Hi\n\n- a\n- b');
    expect(ed.getHTML()).toBe('<h1>Hi</h1><ul><li>a</li><li>b</li></ul>');
    ed.setValue('**x**', 'markdown');
    expect(ed.getHTML()).toBe('<p><strong>x</strong></p>');
    ed.setValue('one\n\ntwo <b>', 'text');
    expect(ed.getHTML()).toBe('<p>one</p><p>two &lt;b&gt;</p>');
    ed.setValue('<p>html</p>');
    expect(ed.getHTML()).toBe('<p>html</p>');
    expect(() => ed.setValue('x', 'nonsense')).toThrow(/no plugin reads/);
  });

  it('sanitizes Markdown that holds HTML', () => {
    const ed = make();
    ed.setMarkdown('<img src=x onerror=alert(1)>\n\n[a](javascript:1)');
    expect(ed.getHTML()).not.toMatch(/onerror|javascript/);
  });

  it('gets what it was given: Markdown in, Markdown out', () => {
    const md = '# Title\n\nSome **bold** text.\n\n- a\n- b';
    const ed = make();
    ed.setMarkdown(md);
    expect(ed.getMarkdown()).toBe(md);
  });

  describe('Markdown-first (valueFormat: markdown)', () => {
    it('takes the value as Markdown, gives Markdown from getValue and in the change event, and keeps getHTML as HTML', () => {
      const seen: string[] = [];
      const ed = make({ valueFormat: 'markdown', value: '# Hi\n\n**bold**' });
      expect(ed.getHTML()).toBe('<h1>Hi</h1><p><strong>bold</strong></p>');
      expect(ed.getValue()).toBe('# Hi\n\n**bold**');
      ed.on('change', (v) => seen.push(v));
      ed.setValue('- a\n- b');
      expect(ed.getHTML()).toBe('<ul><li>a</li><li>b</li></ul>');
      expect(ed.getValue()).toBe('- a\n- b');
      // typing: the change event has Markdown
      const text = (ed as unknown as { content: HTMLElement }).content;
      text.innerHTML = '<p>typed <strong>bold</strong></p>';
      text.dispatchEvent(new Event('input', { bubbles: true }));
      expect(seen[seen.length - 1]).toBe('typed **bold**');
    });

    it('stays HTML by default', () => {
      const ed = make({ value: '<p>x</p>' });
      expect(ed.getValue()).toBe('<p>x</p>');
    });
  });
});

describe('the element', () => {
  defineAurebeshElement();
  // jsdom has the form association of custom elements only in part
  const attach = HTMLElement.prototype.attachInternals;
  HTMLElement.prototype.attachInternals = function (this: HTMLElement) {
    const internals = (attach ? attach.call(this) : {}) as Record<string, unknown>;
    internals['setFormValue'] ??= () => {};
    internals['setValidity'] ??= () => {};
    return internals as unknown as ElementInternals;
  };
  const settle = () => new Promise((r) => setTimeout(r, 5));

  it('sets Markdown with .markdown, and a value-format of markdown makes .value Markdown too', async () => {
    const el = document.createElement('aurebesh-editor') as HTMLElement & { markdown: string; value: string; instance: Aurebesh };
    el.setAttribute('value-format', 'markdown');
    el.textContent = '# From the page\n\ntext';
    document.body.appendChild(el);
    await settle();
    expect(el.instance.getHTML()).toBe('<h1>From the page</h1><p>text</p>');
    expect(el.value).toBe('# From the page\n\ntext');
    el.value = '## Set by property';
    expect(el.instance.getHTML()).toBe('<h2>Set by property</h2>');
    el.markdown = 'plain *markdown*';
    expect(el.instance.getHTML()).toBe('<p>plain <em>markdown</em></p>');
    const changes = vi.fn();
    el.addEventListener('change', (e) => changes((e as CustomEvent<string>).detail));
    (el.querySelector('.aurebesh-content') as HTMLElement).dispatchEvent(new Event('input', { bubbles: true }));
    expect(changes).toHaveBeenCalledWith('plain *markdown*');
    el.remove();
  });

  it('keeps HTML as its value by default, and can still be given Markdown', async () => {
    const el = document.createElement('aurebesh-editor') as HTMLElement & { markdown: string; value: string; instance: Aurebesh };
    el.innerHTML = '<p>html</p>';
    document.body.appendChild(el);
    await settle();
    expect(el.value).toBe('<p>html</p>');
    el.markdown = '**md**';
    expect(el.value).toBe('<p><strong>md</strong></p>');
    el.remove();
  });
});

describe('robustness', () => {
  it('never throws and never hangs, whatever it is given', () => {
    const pieces = ['*', '_', '~', '`', '[', ']', '(', ')', '!', '<', '>', '&', '\\', '#', '-', '+', '|', ':', '\n', '\n\n', '  ', '    ', '1. ', '> ', '```', 'a', 'b c', 'http://x', '<u>', '</u>', '<!--', '-->', '***', '---', '|---|'];
    let seed = 12345;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const started = Date.now();
    for (let k = 0; k < 400; k++) {
      let s = '';
      for (let i = 0, n = 5 + rnd(60); i < n; i++) s += pieces[rnd(pieces.length)];
      expect(() => fromMarkdown(s), JSON.stringify(s)).not.toThrow();
      expect(fromMarkdown(s)).not.toMatch(/<script|javascript:/i);
    }
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('reads a long document in good time', () => {
    const doc = Array.from({ length: 3000 }, (_, i) => `## Heading ${i}\n\nParagraph with **bold**, *em*, \`code\` and [a link](https://example.com/${i}).\n\n- item a\n- item b\n  - nested`).join('\n\n');
    const started = Date.now();
    const out = markdownToHtml(doc);
    expect(out).toContain('<h2>Heading 2999</h2>');
    expect(Date.now() - started).toBeLessThan(3000);
  });
});
