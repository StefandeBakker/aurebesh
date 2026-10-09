import { describe, it, expect } from 'vitest';
import { Aurebesh, sanitize, tokenize } from '../src';

describe('sanitize', () => {
  it('removes scripts, handlers and javascript: urls', () => {
    const out = sanitize('<p onclick="x()">a<script>alert(1)</script><a href="javascript:alert(1)">l</a></p>');
    expect(out).toBe('<p>a<a>l</a></p>');
  });
  it('keeps allowed formatting', () => {
    expect(sanitize('<strong>b</strong><a href="https://x.dev">l</a>')).toContain('<a href="https://x.dev">');
  });
});

describe('fonts', () => {
  it('keeps a safe font-family and drops other styles', () => {
    const out = sanitize(`<span style="color:red; font-family: Georgia, 'Times New Roman', serif">x</span>`);
    expect(out).toBe(`<span style="font-family: Georgia, 'Times New Roman', serif">x</span>`);
  });
  it('drops unsafe font-family values', () => {
    expect(sanitize('<span style="font-family: x;background:url(a)">x</span>')).toContain('style="font-family: x"');
    expect(sanitize('<span style="font-family: url(http://evil)">x</span>')).toBe('<span>x</span>');
  });
  it('renders a font picker with 15 fonts', () => {
    const el = document.createElement('div');
    new Aurebesh(el);
    expect(el.querySelectorAll('select.aurebesh-font option').length).toBe(16);
  });
});

describe('tokenize', () => {
  const kinds = (code: string) => tokenize(code).map((t) => `${t.type}:${code.slice(t.start, t.end)}`);
  it('finds keywords, strings, numbers, functions, comments', () => {
    expect(kinds('const x = foo(42, "a"); // hi')).toEqual([
      'keyword:const', 'function:foo', 'number:42', 'string:"a"', 'comment:// hi',
    ]);
  });
  it('does not treat comparisons or generics as tags, but does treat html tags', () => {
    expect(kinds('i<n')).toEqual([]);
    expect(kinds('Array<string>')).toEqual(['type:Array', 'keyword:string']);
    expect(kinds('<div id="a">')).toEqual(['tag:<div', 'string:"a"']);
  });
  it('handles python/shell comments and ignores #hex', () => {
    expect(kinds('x = 1 # note')).toEqual(['number:1', 'comment:# note']);
    expect(kinds('color: #fff;')).toEqual([]);
  });
  it('does not colour contents of strings and comments separately', () => {
    expect(kinds("'it is if'")).toEqual(["string:'it is if'"]);
    expect(kinds('/* if */ x')).toEqual(['comment:/* if */']);
  });
});

describe('code blocks', () => {
  it('stores line breaks in a code block as newlines and keeps text literal', () => {
    expect(sanitize('<pre>a<br>b &lt;i&gt;</pre>')).toBe('<pre>a\nb &lt;i&gt;</pre>');
  });
  it('leaves <br> outside code blocks alone', () => {
    expect(sanitize('<p>a<br>b</p>')).toBe('<p>a<br>b</p>');
  });
  it('has a code block button', () => {
    const el = document.createElement('div');
    new Aurebesh(el);
    expect(el.querySelector('button[title="Code block"]')).not.toBeNull();
  });
});

describe('colors', () => {
  it('keeps safe color and background-color, drops unsafe values', () => {
    expect(sanitize('<span style="color: rgb(255, 0, 0); background-color: #ff0">x</span>')).toBe(
      '<span style="color: rgb(255, 0, 0); background-color: #ff0">x</span>',
    );
    expect(sanitize('<span style="color: url(javascript:x); position: fixed">x</span>')).toBe('<span>x</span>');
  });
  it('renders color and highlight pickers with 40 swatches each', () => {
    const el = document.createElement('div');
    new Aurebesh(el);
    expect(el.querySelectorAll('.aurebesh-color-grid').length).toBe(2);
    expect(el.querySelectorAll('.aurebesh-color-grid div').length).toBe(80);
  });
});

describe('tables', () => {
  it('keeps table markup and safe spans, strips other attributes', () => {
    const out = sanitize('<table onclick="x()"><tbody><tr><td colspan="2" style="x:y">a</td><td colspan="evil">b</td></tr></tbody></table>');
    expect(out).toBe('<table><tbody><tr><td colspan="2">a</td><td>b</td></tr></tbody></table>');
  });
  it('shows the table picker and hides table tools until the cursor is in a table', () => {
    const el = document.createElement('div');
    new Aurebesh(el);
    expect(el.querySelectorAll('.aurebesh-table-grid div').length).toBe(64);
    expect((el.querySelector('.aurebesh-table-tools') as HTMLElement).hidden).toBe(true);
  });
});

describe('Aurebesh', () => {
  it('mounts, sets and gets html', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const ed = new Aurebesh(el, { value: '<p>hi</p>' });
    expect(ed.getHTML()).toBe('<p>hi</p>');
    ed.setHTML('<p>yo<img src=x onerror=1></p>');
    expect(ed.getHTML()).toBe('<p>yo</p>');
    expect(el.querySelectorAll('.aurebesh-toolbar button').length).toBeGreaterThan(0);
    ed.destroy();
    expect(el.querySelector('.aurebesh')).toBeNull();
  });
  it('supports readOnly and no toolbar', () => {
    const el = document.createElement('div');
    const ed = new Aurebesh(el, { toolbar: [], readOnly: true });
    expect(el.querySelector('.aurebesh-toolbar')).toBeNull();
    expect(ed.content.contentEditable).toBe('false');
  });
});
