import { describe, expect, it } from 'vitest';
import { sanitize, toMarkdown } from '../src';
import { LAYOUTS, blockHtml, normalizeLayouts, rowHtml, rowGap, rowTemplate } from '../src/blocks';

const t = (key: string) => `[${key}]`;
const dom = (html: string): HTMLElement => {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
};

describe('the HTML of the blocks', () => {
  it('has a row for every layout, as a grid of columns with an empty paragraph in each', () => {
    for (const { id, template } of LAYOUTS) {
      const root = dom(blockHtml(id, t));
      const row = root.firstElementChild as HTMLElement;
      expect(row.getAttribute('data-layout'), id).toBe('row');
      expect(rowTemplate(row), id).toBe(template);
      expect(rowGap(row)).toBe(16);
      const cols = Array.from(row.children);
      expect(cols).toHaveLength(template.split(' ').length);
      for (const col of cols) {
        expect(col.getAttribute('data-layout')).toBe('col');
        expect(col.innerHTML).toBe('<p><br></p>');
      }
    }
  });

  it('has the content blocks, with the texts they start from', () => {
    expect(blockHtml('heading', t)).toBe('<h2>[block.headingText]</h2>');
    expect(blockHtml('text', t)).toBe('<p>[block.textText]</p>');
    expect(blockHtml('divider', t)).toBe('<hr>');
    expect(blockHtml('button', t)).toContain('data-button');
    expect(blockHtml('button', t)).toContain('[block.buttonText]');
    expect(blockHtml('image', t)).toBe(''); // an image asks for a file first
    expect(blockHtml('nonsense', t)).toBe('');
  });

  it('escapes the texts', () => {
    expect(blockHtml('heading', () => '<b>"x"</b>')).toBe('<h2>&lt;b&gt;&quot;x&quot;&lt;/b&gt;</h2>');
  });

  it('survives the sanitizer unchanged: the editor can keep what it makes', () => {
    for (const id of [...LAYOUTS.map((l) => l.id), 'heading', 'text', 'button', 'divider']) {
      const html = blockHtml(id, (key) => (key === 'block.buttonText' ? 'Go' : 'x'));
      expect(sanitize(html), id).toBe(html);
    }
  });
});

describe('the sanitizer and layouts', () => {
  it('keeps a row and its columns with the few styles they may have', () => {
    const html = '<div data-layout="row" style="display: grid; grid-template-columns: 30% 70%; gap: 8px; align-items: center"><div data-layout="col" style="min-width: 0; padding: 8px; background-color: #fef08a"><p>a</p></div><div data-layout="col"><p>b</p></div></div>';
    expect(sanitize(html)).toBe(html);
  });

  it('drops what a row or a column must not have', () => {
    const out = sanitize(
      '<div data-layout="row" style="display: flex; grid-template-columns: 1fr 2fr 3fr 4fr 5fr 6fr 7fr; position: fixed; gap: 8px"><div data-layout="col" style="width: 99px; min-width: 0">x</div></div>',
    );
    expect(out).toBe('<div data-layout="row" style="gap: 8px"><div data-layout="col" style="min-width: 0">x</div></div>');
  });

  it('allows grid columns in fr and percent, up to six, and nothing else in them', () => {
    const row = (value: string) => sanitize(`<div data-layout="row" style="grid-template-columns: ${value}">x</div>`);
    expect(row('1fr 1fr 1fr 1fr 1fr 1fr')).toContain('grid-template-columns');
    expect(row('1fr 1fr 1fr 1fr 1fr 1fr 1fr')).not.toContain('grid-template-columns');
    expect(row('repeat(3, 1fr)')).not.toContain('grid-template-columns');
    expect(row('url(x) 1fr')).not.toContain('grid-template-columns');
    expect(row('100px 1fr')).not.toContain('grid-template-columns');
  });

  it('removes an unknown layout marker and the grid styles of a div that is not a row', () => {
    expect(sanitize('<div data-layout="evil" style="display: grid">x</div>')).toBe('<div>x</div>');
    expect(sanitize('<div style="display: grid">x</div>')).toBe('<div>x</div>');
  });

  it('keeps a button only with the styles of a button, and only on a link that says it is one', () => {
    const button = '<a href="https://example.com" data-button="" style="display: inline-block; padding: 10px 20px; background-color: #2563eb; color: #ffffff; border-radius: 6px; text-decoration: none">Go</a>';
    expect(sanitize(button)).toBe(button);
    expect(sanitize('<a href="https://example.com" data-button style="position: fixed; color: #ffffff">Go</a>')).toBe('<a href="https://example.com" data-button="" style="color: #ffffff">Go</a>');
    expect(sanitize('<a href="https://example.com" style="color: #ffffff; display: inline-block">Go</a>')).toBe('<a href="https://example.com">Go</a>'); // a plain link has no styles
    expect(sanitize('<a href="javascript:alert(1)" data-button>Go</a>')).toBe('<a data-button="">Go</a>');
  });
});

describe('keeping a layout whole', () => {
  it('puts a paragraph in an empty column, and wraps what is loose in a row in a column', () => {
    const root = dom('<p>before</p><div data-layout="row"><div data-layout="col"></div>loose text<div data-layout="col"><p>x</p></div></div><p>after</p>');
    expect(normalizeLayouts(root)).toBe(true);
    const row = root.querySelector('[data-layout="row"]')!;
    const cols = Array.from(row.children);
    expect(cols).toHaveLength(3);
    expect(cols.every((c) => c.getAttribute('data-layout') === 'col')).toBe(true);
    expect(cols[0].innerHTML).toBe('<p><br></p>');
    expect(cols[1].innerHTML).toBe('<p>loose text</p>');
    expect(cols[2].innerHTML).toBe('<p>x</p>');
  });

  it('gives a row without columns one, and takes the column away from a column that lost its row', () => {
    const root = dom('<p>a</p><div data-layout="row"></div><p>b</p><div data-layout="col"><p>orphan</p></div><p>c</p>');
    normalizeLayouts(root);
    expect(root.querySelector('[data-layout="row"] > [data-layout="col"] > p')).not.toBeNull();
    expect(root.querySelectorAll('[data-layout="col"]')).toHaveLength(1); // the orphan is gone, its text stays
    expect(root.textContent).toContain('orphan');
    expect(root.querySelector('[data-layout="col"]')!.parentElement!.getAttribute('data-layout')).toBe('row');
  });

  it('keeps a paragraph before a row at the start and after a row at the end, to carry on typing', () => {
    const root = dom(rowHtml('1fr 1fr'));
    normalizeLayouts(root);
    expect(root.firstElementChild!.tagName).toBe('P');
    expect(root.lastElementChild!.tagName).toBe('P');
    expect(root.children).toHaveLength(3);
  });

  it('does nothing to a layout that is whole', () => {
    const root = dom(`<p>a</p>${rowHtml('1fr 2fr')}<p>b</p>`);
    expect(normalizeLayouts(root)).toBe(false);
  });

  it('does not touch a row inside a column: a row in a column needs no paragraphs beside it', () => {
    const root = dom(`<p>a</p><div data-layout="row" style="display: grid; grid-template-columns: 1fr"><div data-layout="col">${rowHtml('1fr 1fr')}</div></div><p>b</p>`);
    normalizeLayouts(root);
    const outer = root.querySelector('[data-layout="row"]')!;
    const inner = outer.querySelector('[data-layout="row"]')!;
    expect(inner.parentElement!.getAttribute('data-layout')).toBe('col');
    expect(inner.previousElementSibling).toBeNull();
  });
});

describe('Markdown of a layout', () => {
  it('is the content of the columns one after the other', () => {
    const md = toMarkdown(`${rowHtml('1fr 1fr').replace('<p><br></p>', '<h2>Left</h2>').replace('<p><br></p>', '<p>Right</p>')}`);
    expect(md).toBe('## Left\n\nRight');
  });
});
