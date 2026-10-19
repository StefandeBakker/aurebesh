import { describe, it, expect } from 'vitest';
import { Aurebesh, sanitize, tokenize, LABELS_NL, COMMANDS, DEFAULT_TOOLBAR } from '../src';
import { DEFAULT_QUICKBAR } from '../src/commands';
import { normalizeLink } from '../src/inline';

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
    expect(sanitize('<span style="font-family: url(http://evil)">x</span>')).toBe('x'); // nothing left to style: the span goes
  });
  it('renders a font picker with 15 fonts', () => {
    const el = document.createElement('div');
    new Aurebesh(el);
    expect(el.querySelectorAll('select.aurebesh-font option').length).toBe(16);
  });
});

describe('styles per tag', () => {
  it('allows font-size steps on spans and text-align on blocks only', () => {
    expect(sanitize('<span style="font-size: x-large">a</span>')).toBe('<span style="font-size: x-large">a</span>');
    expect(sanitize('<span style="font-size: 500px">a</span>')).toBe('a');
    expect(sanitize('<p style="text-align: center; color: red">a</p>')).toBe('<p style="text-align: center">a</p>');
    expect(sanitize('<span style="text-align: center">a</span>')).toBe('a');
    expect(sanitize('<p style="text-align: expression(alert(1))">a</p>')).toBe('<p>a</p>');
  });
  it('allows image width and alignment, drops positioning', () => {
    const out = sanitize('<img src="https://x.dev/a.png" style="width: 50%; display: block; margin-left: auto; position: fixed; top: 0">');
    expect(out).toContain('width: 50%');
    expect(out).toContain('display: block');
    expect(out).toContain('margin-left: auto');
    expect(out).not.toContain('position');
    expect(sanitize('<img src="https://x.dev/a.png" style="width: 1000px">')).not.toContain('style');
  });
  it('allows superscript and subscript', () => {
    expect(sanitize('x<sup>2</sup><sub>i</sub>')).toBe('x<sup>2</sup><sub>i</sub>');
  });
});

describe('clean output', () => {
  it('unwraps spans that carry nothing and normalizes nested lists', () => {
    expect(sanitize('<p>a<span style="font-weight: bold"> b</span></p>')).toBe('<p>a b</p>');
    expect(sanitize('<ul><li>a</li><ul><li>b</li></ul></ul>')).toBe('<ul><li>a<ul><li>b</li></ul></li></ul>');
    expect(sanitize('<ol><ul><li>x</li></ul></ol>')).toBe('<ol><li><ul><li>x</li></ul></li></ol>');
  });

  it('getHTML() returns sanitized HTML and an empty string for an empty editor', () => {
    const el = document.createElement('div');
    const ed = new Aurebesh(el);
    expect(ed.getHTML()).toBe('');
    ed.setHTML('<p><br></p>');
    expect(ed.getHTML()).toBe('');
    ed.setHTML('<p>hi</p>');
    expect(ed.getHTML()).toBe('<p>hi</p>');
    // leftovers a browser can put in the live DOM do not reach the output
    ed.content.innerHTML = '<p>a<span style="font-family: inherit;"> b</span><b style=""> c</b></p><div data-new>d</div>';
    ed.content.dispatchEvent(new Event('input'));
    expect(ed.getHTML()).toBe('<p>a b<b> c</b></p><div>d</div>');
  });
});

describe('links', () => {
  it('normalizes what people type and refuses unsafe schemes', () => {
    expect(normalizeLink('example.com')).toBe('https://example.com');
    expect(normalizeLink('example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(normalizeLink('me@example.com')).toBe('mailto:me@example.com');
    expect(normalizeLink('https://x.dev')).toBe('https://x.dev');
    expect(normalizeLink('/relative')).toBe('/relative');
    expect(normalizeLink('  ')).toBe('');
    expect(() => normalizeLink('javascript:alert(1)')).toThrow(/Unsupported link/);
    expect(() => normalizeLink('data:text/html,x')).toThrow();
  });
});

describe('labels', () => {
  it('translates tooltips and popover texts, keeps the rest in English', () => {
    const el = document.createElement('div');
    new Aurebesh(el, { labels: { ...LABELS_NL, bold: 'Vet' } });
    expect(el.querySelector('button[title="Vet"]')).not.toBeNull();
    expect(el.querySelector('button[title="Cursief"]')).not.toBeNull();
    expect(el.querySelector('select.aurebesh-font')?.getAttribute('title')).toBe('Lettertype');
    const partial = document.createElement('div');
    new Aurebesh(partial, { labels: { bold: 'Fett' } });
    expect(partial.querySelector('button[title="Fett"]')).not.toBeNull();
    expect(partial.querySelector('button[title="Italic"]')).not.toBeNull();
  });
  it('every toolbar command has a Dutch label', () => {
    for (const name of Object.keys(COMMANDS)) {
      if (['videoFile', 'imageWidth', 'imageAlign', 'imageAlt'].includes(name)) continue; // internal
      expect(LABELS_NL[name], `missing nl label for ${name}`).toBeTruthy();
    }
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
    expect(sanitize('<span style="color: url(javascript:x); position: fixed">x</span>')).toBe('x');
  });
  it('renders color and highlight pickers with 40 swatches each, and one more for the strikethrough', () => {
    const el = document.createElement('div');
    new Aurebesh(el);
    const text = '.aurebesh-toolbar:not(.aurebesh-table-tools) .aurebesh-color-grid'; // the table tools have two more, for the cells; the strikethrough look has one
    expect(el.querySelectorAll(text).length).toBe(3);
    expect(el.querySelectorAll(text + ' button').length).toBe(120);
    expect(el.querySelectorAll('.aurebesh-table-tools .aurebesh-color-grid').length).toBe(2);
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
    expect(el.querySelectorAll('.aurebesh-table-grid button').length).toBe(64);
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

describe('the default toolbar', () => {
  /** Blocks of rows of items: `|` starts a block, `/` a second row in it. */
  const blocks = (items: string[]) =>
    items
      .join(' ')
      .split(' | ')
      .map((g) => g.split(' / ').map((r) => r.split(' ')));

  it('follows the Home tab of Word: blocks of two rows (the font, the paragraph, the styles, what can be inserted, the layout)', () => {
    expect(blocks(DEFAULT_TOOLBAR)).toEqual([
      [['font', 'size', 'clear', 'clearStyle'], ['bold', 'italic', 'underline', 'strike', 'strikeStyle', 'highlight', 'color']],
      [['ul', 'ol', 'task'], ['alignLeft', 'alignCenter', 'alignRight']],
      [['h1', 'h2', 'quote'], ['code', 'codeblock']], // the headings and the quote; the two kinds of code
      [['link', 'image', 'video'], ['table', 'hr']],
      [['columns']],
    ]);
    // undo and redo are in the strip above it, not in the toolbar
    expect(DEFAULT_TOOLBAR).not.toContain('undo');
    expect(DEFAULT_QUICKBAR).toEqual(['undo', 'redo']);
  });

  it('has only items that exist, each once, and no separator at the start, the end or doubled', () => {
    const items = DEFAULT_TOOLBAR.filter((i) => i !== '|' && i !== '/');
    for (const i of items) expect(COMMANDS[i], i).toBeDefined();
    expect(new Set(items).size).toBe(items.length);
    const joined = DEFAULT_TOOLBAR.join(' ');
    expect(joined).not.toMatch(/^[|/]|[|/]$|[|/] [|/]/);
  });

  const build = (o: object = {}) => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    new Aurebesh(el, o);
    return el;
  };
  const main = (el: HTMLElement) => el.querySelector('.aurebesh-toolbar:not(.aurebesh-quickbar)') as HTMLElement;
  /** The rows of each block, as lists of titles. */
  const shape = (el: HTMLElement) =>
    Array.from(main(el).querySelectorAll(':scope > .aurebesh-group')).map((g) =>
      Array.from(g.querySelectorAll(':scope > .aurebesh-row')).map((r) => Array.from(r.querySelectorAll('button, select')).filter((e) => !e.closest('.aurebesh-table-pop')).map((e) => e.getAttribute('title'))),
    );

  it('is what the editor builds: five blocks, the first with the font on top and the character styles below', () => {
    const el = build();
    const s = shape(el);
    expect(s).toHaveLength(5);
    expect(s.map((g) => g.length)).toEqual([2, 2, 2, 2, 1]);
    expect(s[0][0]).toEqual(['Font', 'Size', 'Clear formatting', 'Clear one kind of formatting']);
    expect(s[0][1].slice(0, 4)).toEqual(['Bold', 'Italic', 'Underline', 'Strikethrough']);
    expect(s[0][1]).not.toContain('Inline code'); // inline code is with the code block, not with the character styles
    expect(s[2]).toEqual([['Heading 1', 'Heading 2', 'Quote'], ['Inline code', 'Code block']]);
    el.remove();
  });

  it('has undo and redo in the strip above, and the strip only with the default toolbar, so they are not there twice', () => {
    const el = build();
    expect(Array.from(el.querySelectorAll('.aurebesh-quickbar button')).map((b) => b.getAttribute('title'))).toEqual(['Undo', 'Redo']);
    expect(el.querySelector('.aurebesh')!.firstElementChild!.classList.contains('aurebesh-quickbar')).toBe(true);
    expect(main(el).querySelector('button[title="Undo"]')).toBeNull();
    el.remove();
    const count = (o: object) => {
      const e = build(o);
      const r = { strip: e.querySelectorAll('.aurebesh-quickbar').length, undo: e.querySelectorAll('button[title="Undo"]').length };
      e.remove();
      return r;
    };
    expect(count({ toolbar: ['bold', 'undo'] })).toEqual({ strip: 0, undo: 1 }); // your own toolbar: no strip
    expect(count({ toolbar: ['bold'], quickbar: ['undo', 'redo'] })).toEqual({ strip: 1, undo: 1 });
    expect(count({ quickbar: [] })).toEqual({ strip: 0, undo: 0 });
    expect(count({ toolbar: [], quickbar: ['undo'] })).toEqual({ strip: 1, undo: 1 }); // a strip without a toolbar
  });

  it('keeps a command that is in the strip and in the toolbar in step: both are disabled when read-only', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const ed = new Aurebesh(el, { toolbar: ['bold', 'undo'], quickbar: ['undo'] });
    const both = Array.from(el.querySelectorAll('button[title="Undo"]')) as HTMLButtonElement[];
    expect(both).toHaveLength(2);
    ed.setReadOnly(true);
    expect(both.map((b) => b.disabled)).toEqual([true, true]);
    ed.setReadOnly(false);
    expect(both.map((b) => b.disabled)).toEqual([false, false]);
    el.remove();
  });

  it('recomputes command availability when editing is re-enabled', () => {
    const el = document.createElement('div');
    const ed = new Aurebesh(el, { toolbar: ['indent'] });
    const button = el.querySelector('button[title="Indent"]') as HTMLButtonElement;
    ed.setReadOnly(true);
    ed.setReadOnly(false);
    expect(button.disabled).toBe(true);
    el.remove();
  });

  it('tracks every font, size, and orientation control across both bars', () => {
    const el = document.createElement('div');
    const ed = new Aurebesh(el, {
      toolbar: ['font', 'size', 'orientation'],
      quickbar: ['font', 'size', 'orientation'],
      page: 'a4',
    });
    const fonts = Array.from(el.querySelectorAll('select.aurebesh-font')) as HTMLSelectElement[];
    const sizes = Array.from(el.querySelectorAll('select.aurebesh-size')) as HTMLSelectElement[];
    const orientations = Array.from(el.querySelectorAll('button.aurebesh-orientation')) as HTMLButtonElement[];
    expect([fonts.length, sizes.length, orientations.length]).toEqual([2, 2, 2]);
    ed.setReadOnly(true);
    expect([...fonts, ...sizes, ...orientations].every((control) => control.disabled)).toBe(true);
    ed.setReadOnly(false);
    ed.setPageOrientation('landscape');
    expect([...fonts, ...sizes, ...orientations].every((control) => !control.disabled)).toBe(true);
    expect(orientations.map((button) => button.getAttribute('aria-pressed'))).toEqual(['true', 'true']);
    el.remove();
  });

  it('builds the strip from the same controls as the toolbar, so a picker stays a picker', () => {
    const el = build({ toolbar: ['bold'], quickbar: ['link', 'table', 'color', 'undo'] });
    const strip = el.querySelector('.aurebesh-quickbar')!;
    expect(strip.querySelector('button[title="Link"]')!.getAttribute('aria-haspopup')).toBe('true');
    expect(strip.querySelector('button[title="Table"]')!.getAttribute('aria-haspopup')).toBe('true');
    expect(strip.querySelector('.aurebesh-swatch-color')).not.toBeNull();
    expect(strip.querySelector('input[inputmode="url"]')).not.toBeNull(); // the link box
    el.remove();
  });

  it('makes a block of every | and a row of every /, and skips empty ones', () => {
    const t = (toolbar: string[]) => {
      const e = build({ toolbar });
      const r = shape(e).map((g) => g.map((row) => row.length));
      e.remove();
      return r;
    };
    expect(t(['bold', 'italic', '|', 'link'])).toEqual([[2], [1]]); // a toolbar with | only: blocks of one row
    expect(t(['bold', '/', 'italic', 'underline'])).toEqual([[1, 2]]);
    expect(t(['|', '|', 'bold', '|', '/', '|', 'italic', '/', '/', 'strike'])).toEqual([[1], [1, 1]]);
    expect(t(['bold', 'italic', 'underline'])).toEqual([[3]]); // without any separator: one block, one row, which wraps
    expect(t(['nonsense', 'bold'])).toEqual([[1]]); // an unknown name is left out
  });
});
