import { describe, expect, it } from 'vitest';
import { toMarkdown } from '../src';
import { turnInto } from '../src/blockops';

describe('white space at the end of a line in Markdown', () => {
  it('keeps a hard break and takes the rest away', () => {
    expect(toMarkdown('<p>one<br>two</p>')).toBe('one  \ntwo');
    expect(toMarkdown('<pre>a \t \nb</pre>')).toBe('```\na\nb\n```');
    expect(toMarkdown('<p>x</p><pre>a  \nb</pre>')).toBe('x\n\n```\na  \nb\n```');
  });

  it('is written in a moment when a code block has long runs of spaces and tabs', () => {
    const start = performance.now();
    toMarkdown('<pre>' + ' '.repeat(200000) + 'x' + '\t'.repeat(200000) + '\nnext</pre>');
    expect(performance.now() - start).toBeLessThan(1500);
  });
});

describe('a block turned into a code block', () => {
  const content = (html: string) => {
    const el = document.createElement('div');
    el.innerHTML = html;
    document.body.appendChild(el);
    return el;
  };

  it('has the text of it: line breaks become lines, the tags are gone and nothing is read as a tag', () => {
    const el = content('<p>a <strong>b</strong><br>c &lt;i&gt; <script>x</script></p>');
    turnInto(el, el.firstElementChild as HTMLElement, 'code');
    expect(el.innerHTML).toBe('<pre>a b\nc &lt;i&gt; x</pre>');
  });

  it('cannot be fooled by text that makes a tag when the tags next to it are taken out', () => {
    const el = content('<p>&lt;&lt;script&gt;script&gt;alert(1)</p>');
    turnInto(el, el.firstElementChild as HTMLElement, 'code');
    expect(el.querySelector('script')).toBeNull();
    expect(el.innerHTML).toBe('<pre>&lt;&lt;script&gt;script&gt;alert(1)</pre>');
  });

  it('is a line for each item of a list, and each paragraph of a callout', () => {
    const list = content('<ul><li>one<ul><li>nested</li></ul></li><li>two <em>x</em></li></ul>');
    turnInto(list, list.firstElementChild as HTMLElement, 'code');
    expect(list.innerHTML).toBe('<pre>one\nnested\ntwo x</pre>');
    const callout = content('<div data-callout="note"><p>first</p><p>sec<b>ond</b></p></div>');
    turnInto(callout, callout.firstElementChild as HTMLElement, 'code');
    expect(callout.innerHTML).toBe('<pre>first\nsecond</pre>');
  });
});
